#!/usr/bin/env bash
# =====================================================================
# WebDAV 连接问题一键诊断脚本（只读，不会修改任何配置）
#
# 用法：在服务器上执行
#     sudo bash diagnose.sh
#
# 它会依次检查：Docker 状态 → 容器日志 → 端口监听 → 本机 WebDAV 响应
# → 公网入口响应 → 防火墙，并在最后给出结论与建议。
# =====================================================================

C_OK="\033[32m"; C_ERR="\033[31m"; C_WARN="\033[33m"; C_INFO="\033[36m"; C_END="\033[0m"
ok()   { echo -e "  ${C_OK}[通过]${C_END} $1"; }
bad()  { echo -e "  ${C_ERR}[异常]${C_END} $1"; }
warn() { echo -e "  ${C_WARN}[注意]${C_END} $1"; }
info() { echo -e "  ${C_INFO}[信息]${C_END} $1"; }
sec()  { echo; echo "=================================================="; echo " $1"; echo "=================================================="; }

PORT=8080
CONTAINER=obsidian-webdav
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HINTS=""

# ---------- 读取 .env 里的账号密码（若存在） ----------
WEBDAV_USER=""; WEBDAV_PASS=""
if [ -f "$SCRIPT_DIR/.env" ]; then
  WEBDAV_USER=$(grep -E '^WEBDAV_USER=' "$SCRIPT_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
  WEBDAV_PASS=$(grep -E '^WEBDAV_PASS=' "$SCRIPT_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"' \r')
fi

sec "1. 系统与 Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker 已安装：$(docker --version 2>/dev/null)"
else
  bad "未找到 docker 命令"; echo "   → 请先安装 Docker（可重跑 deploy.sh）"; exit 1
fi

if docker compose version >/dev/null 2>&1; then
  ok "docker compose 可用：$(docker compose version --short 2>/dev/null)"
elif command -v docker-compose >/dev/null 2>&1; then
  warn "仅有旧版 docker-compose，可继续使用"
else
  warn "未检测到 docker compose 插件"
fi

sec "2. 容器状态"
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  LINE=$(docker ps -a --filter "name=^${CONTAINER}$" --format '{{.Status}}')
  info "容器 ${CONTAINER}：${LINE}"
  if echo "$LINE" | grep -qi "up"; then
    ok "容器正在运行"
  else
    bad "容器未在运行（状态：${LINE}）"
    HINTS="${HINTS}\n  - 容器没起来：docker logs ${CONTAINER} 查看报错；常见是基础镜像没拉到（镜像源问题）"
  fi
  # 端口映射检查
  PORTS=$(docker ps -a --filter "name=^${CONTAINER}$" --format '{{.Ports}}')
  info "端口映射：${PORTS:-（无）}"
  echo "$PORTS" | grep -q "0.0.0.0:${PORT}->" && ok "已映射宿主机 ${PORT} 端口" || {
    bad "没有把宿主机 ${PORT} 映射出来"
    HINTS="${HINTS}\n  - 端口映射缺失：确认 docker-compose.yml 中为 \"${PORT}:8080\""
  }
else
  bad "找不到容器 ${CONTAINER}（服务可能从未成功启动过）"
  HINTS="${HINTS}\n  - 容器不存在：在 server/ 目录重新执行 docker compose up -d --build"
fi

sec "3. 容器最近日志（末尾 40 行）"
if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -q "^${CONTAINER}$"; then
  docker logs --tail 40 "$CONTAINER" 2>&1 | sed 's/^/  | /'
else
  info "（无容器可查看）"
fi

sec "4. 宿主机端口监听情况"
if command -v ss >/dev/null 2>&1; then
  LISTEN=$(ss -lntp 2>/dev/null | grep ":${PORT} ")
else
  LISTEN=$(netstat -lntp 2>/dev/null | grep ":${PORT} ")
fi
if [ -n "$LISTEN" ]; then
  ok "宿主机 ${PORT} 端口有程序在监听："
  echo "$LISTEN" | sed 's/^/  /'
else
  bad "宿主机 ${PORT} 端口没有任何程序监听"
  HINTS="${HINTS}\n  - 端口无人监听：容器未运行或端口映射错误，外部自然连不上"
fi

sec "5. 本机（容器内网）WebDAV 响应测试"
if curl -s -o /dev/null -m 8 -w "" "http://127.0.0.1:${PORT}/healthz" 2>/dev/null; then
  HEALTH=$(curl -s -m 8 "http://127.0.0.1:${PORT}/healthz" 2>/dev/null | tr -d '\r\n')
  if [ "$HEALTH" = "ok" ]; then
    ok "GET /healthz 返回 ok —— 服务本身是活的"
  else
    warn "GET /healthz 有响应但内容异常：${HEALTH}"
  fi
else
  CODE=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "http://127.0.0.1:${PORT}/" 2>/dev/null)
  bad "本机访问 http://127.0.0.1:${PORT}/ 失败（curl 返回码 ${CODE:-超时/无响应}）"
  if [ -z "$CODE" ] || [ "$CODE" = "000" ]; then
    HINTS="${HINTS}\n  - 本机都连不上：ngx_http_dav_ext 模块加载失败或 nginx.conf 有错，看第 3 节日志"
  fi
fi

echo "  --- PROPFIND 认证测试（这就是插件实际发的请求）---"
AUTH_RESP=$(curl -s -o /dev/null -m 10 -w '%{http_code}' -u "${WEBDAV_USER:-obsidian}:${WEBDAV_PASS:-x}" \
  -X PROPFIND "http://127.0.0.1:${PORT}/" \
  -H "Depth: 0" -H "Content-Type: application/xml; charset=utf-8" \
  --data '<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>' 2>/dev/null)
case "$AUTH_RESP" in
  207) ok "PROPFIND 返回 207 Multi-Status —— WebDAV 功能完全正常" ;;
  200|204) ok "PROPFIND 返回 ${AUTH_RESP}（可用）" ;;
  401) warn "PROPFIND 返回 401 —— 认证失败：.env 里的用户名/密码与插件里填的不一致" ;;
  403) warn "PROPFIND 返回 403 —— 权限或 dav_ext_methods 配置问题" ;;
  405) bad "PROPFIND 返回 405 —— PROPFIND 方法未被允许，说明 dav 扩展模块没生效（检查 nginx.conf 的 dav_ext_methods / load_module）"
       HINTS="${HINTS}\n  - 405：镜像里缺少 ngx_http_dav_ext_module，需要重新 build（apk 包名 nginx-mod-http-dav-ext）" ;;
  000|"") bad "PROPFIND 无任何响应（TCP 不通）"
       HINTS="${HINTS}\n  - 本机 PROPFIND 无响应：nginx 进程异常，看第 3 节日志" ;;
  *) warn "PROPFIND 返回 ${AUTH_RESP}（非预期状态码，请对照第 3 节日志）" ;;
esac
[ -n "$WEBDAV_USER" ] || warn "未从 .env 读到账号密码，PROPFIND 测试可能返回 401，属正常"

sec "6. 公网入口测试（模拟插件从外网访问）"
PUBIP=$(curl -s -m 6 ifconfig.me 2>/dev/null || curl -s -m 6 ip.sb 2>/dev/null)
if [ -n "$PUBIP" ]; then
  info "检测到公网 IP：${PUBIP}"
  PUB_CODE=$(curl -s -o /dev/null -m 10 -w '%{http_code}' "http://${PUBIP}:${PORT}/healthz" 2>/dev/null)
  if [ "$PUB_CODE" = "200" ]; then
    ok "通过公网 IP 访问 /healthz 成功 —— 外部链路是通的"
  else
    bad "通过公网 IP 访问失败（返回码 ${PUB_CODE:-无响应}）"
    HINTS="${HINTS}\n  - 公网不通：云厂商【安全组】需放行 ${PORT}/TCP（入方向）"
    HINTS="${HINTS}\n  - 服务器本机防火墙也需放行：firewall-cmd --permanent --add-port=${PORT}/tcp && firewall-cmd --reload"
  fi
else
  warn "无法获取公网 IP（服务器可能无外网），跳过该项"
fi

sec "7. 防火墙与 SELinux"
if command -v firewall-cmd >/dev/null 2>&1; then
  if systemctl is-active firewalld >/dev/null 2>&1; then
    if firewall-cmd --list-ports 2>/dev/null | grep -q "${PORT}/tcp"; then
      ok "firewalld 已放行 ${PORT}/tcp"
    else
      bad "firewalld 未放行 ${PORT}/tcp"
      HINTS="${HINTS}\n  - 执行：firewall-cmd --permanent --add-port=${PORT}/tcp && firewall-cmd --reload"
    fi
  else
    info "firewalld 未运行（跳过）"
  fi
else
  info "未安装 firewalld（跳过）"
fi

if command -v getenforce >/dev/null 2>&1; then
  SE=$(getenforce 2>/dev/null)
  [ "$SE" = "Enforcing" ] && warn "SELinux 处于 Enforcing，可能拦截非标准端口：setsebool -P httpd_can_network_connect 1" || info "SELinux：${SE}"
fi

sec "8. 结论与建议"
if [ -z "$HINTS" ]; then
  echo -e "  ${C_OK}未发现服务端明显问题。${C_END}"
  echo "  若此时 Obsidian 插件仍报 net::ERR_EMPTY_RESPONSE，请优先排查客户端一侧："
  echo "   1) 系统代理 / VPN（Clash、V2Ray、公司代理）是否拦截——先完全关闭再测；"
  echo "   2) 用浏览器访问 http://<你的服务器IP>:${PORT}/healthz 是否能打开；"
  echo "   3) 插件里服务器地址是否写成了 https://（服务端目前是 http）。"
else
  echo -e "  发现以下问题，建议按顺序处理："
  echo -e "$HINTS"
fi
echo
echo "诊断完成。把本页输出整段发给我，我帮你继续定位。"
