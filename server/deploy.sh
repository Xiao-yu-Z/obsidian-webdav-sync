#!/usr/bin/env bash
# =====================================================================
# deploy.sh — Obsidian 私有 WebDAV 同步服务 一键部署脚本
# 适用系统：OpenCloudOS 9 / CentOS / RHEL / 其他支持 Docker 的 Linux
#
# 功能：
#   1. 自动检测并安装 Docker 与 Docker Compose（v2 插件）
#   2. 创建数据存储目录 ./data
#   3. 引导设置账号密码，写入 .env（容器启动时据此生成 htpasswd）
#   4. 构建并启动服务（restart: always）
#   5. 开放防火墙端口（若 firewalld 正在运行）并输出访问地址：
#        8080 = HTTPS（电脑端） / 8081 = HTTP 明文（安卓端）
#   6. 验证 WebDAV 服务是否正常
#
# 用法：
#   sudo bash deploy.sh
#   WEBDAV_USER=obsidian WEBDAV_PASS=xxxx sudo -E bash deploy.sh   # 非交互
# =====================================================================

set -euo pipefail

# ---------- 颜色输出 ----------
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; NC=''
fi
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---------- 前置检查 ----------
if [ "$(id -u)" -ne 0 ]; then
  error "请使用 root 权限运行：sudo bash deploy.sh"
  exit 1
fi

# 切换到脚本所在目录，保证相对路径正确
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PORT=8080          # HTTPS（桌面端）
PORT_PLAIN=8081    # HTTP 明文（安卓端：Android 不信任用户安装的证书）
DATA_DIR="./data"

# ---------- 1. 安装 Docker ----------
ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    info "检测到已安装 Docker：$(docker --version | head -n1)"
  else
    warn "未检测到 Docker，开始自动安装（使用官方脚本）..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable --now docker
    info "Docker 安装完成：$(docker --version)"
  fi

  # 确认 docker compose v2 可用
  if docker compose version >/dev/null 2>&1; then
    info "Docker Compose 可用：$(docker compose version | head -n1)"
  else
    error "Docker Compose 不可用，请检查安装。"
    exit 1
  fi
}

# ---------- 2. 创建数据目录与证书目录 ----------
prepare_data() {
  mkdir -p "$DATA_DIR"
  chmod 755 "$DATA_DIR"
  info "数据目录已就绪：$DATA_DIR"

  # 证书目录：留空即可，容器首启会自动生成自签名证书；
  # 若你放了受信任证书（fullchain.pem / privkey.pem），容器将直接使用。
  mkdir -p "./ssl"
  info "证书目录已就绪：./ssl（容器首启会自动生成自签名证书）"
}

# ---------- 3. 设置账号密码 ----------
setup_credentials() {
  # 非交互模式：从环境变量读取
  if [ -n "${WEBDAV_USER:-}" ] && [ -n "${WEBDAV_PASS:-}" ]; then
    info "使用环境变量中的账号密码（WEBDAV_USER）。"
  else
    read -r -p "请输入 WebDAV 用户名 [默认 obsidian]: " WEBDAV_USER
    WEBDAV_USER="${WEBDAV_USER:-obsidian}"
    while true; do
      read -r -s -p "请输入 WebDAV 密码（不会回显）: " WEBDAV_PASS
      echo
      if [ -z "$WEBDAV_PASS" ]; then
        warn "密码不能为空，请重新输入。"
        continue
      fi
      read -r -s -p "请再次输入密码确认: " WEBDAV_PASS2
      echo
      if [ "$WEBDAV_PASS" = "$WEBDAV_PASS2" ]; then
        break
      fi
      warn "两次输入不一致，请重新输入。"
    done
  fi

  # 写入 .env（compose 会读取）
  cat > .env <<EOF
WEBDAV_USER=${WEBDAV_USER}
WEBDAV_PASS=${WEBDAV_PASS}
EOF
  chmod 600 .env
  info "账号密码已写入 .env（权限 600）。"
}

# ---------- 4. 防火墙放行 ----------
open_firewall() {
  if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    info "检测到 firewalld，放行 TCP ${PORT}（HTTPS）与 ${PORT_PLAIN}（安卓明文）..."
    firewall-cmd --permanent --add-port=${PORT}/tcp >/dev/null 2>&1 || true
    firewall-cmd --permanent --add-port=${PORT_PLAIN}/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    info "防火墙端口 ${PORT} / ${PORT_PLAIN} 已放行。"
  else
    warn "未检测到 firewalld（或已关闭）。若你的服务器在云厂商处，请到安全组手动放行 TCP ${PORT} 与 ${PORT_PLAIN}。"
  fi
}

# ---------- 5. 构建并启动 ----------
start_service() {
  info "开始构建并启动 WebDAV 服务（首次构建需拉取镜像，请稍候）..."
  docker compose up -d --build
  info "服务已启动。"
}

# ---------- 6. 验证 ----------
verify() {
  sleep 3
  # 服务端已启用 HTTPS；自签名证书用 -k 跳过校验证（仅本地探测连通性）
  if curl -ksS -u "${WEBDAV_USER}:${WEBDAV_PASS}" \
     -X PROPFIND "https://127.0.0.1:${PORT}/" \
     -H "Depth: 0" -H "Content-Type: application/xml; charset=utf-8" \
     --data '<propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>' >/dev/null 2>&1; then
    info "WebDAV 服务（HTTPS）验证通过 ✅"
  else
    warn "本地验证未通过，请检查容器日志：docker compose logs webdav"
  fi

  # 尝试获取服务器对外 IP
  SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -z "$SERVER_IP" ] && SERVER_IP="<你的服务器IP>"

  # 明文端口连通性探测（安卓端走这个端口）
  if curl -sS -u "${WEBDAV_USER}:${WEBDAV_PASS}" \
     -X PROPFIND "http://127.0.0.1:${PORT_PLAIN}/" \
     -H "Depth: 0" -H "Content-Type: application/xml; charset=utf-8" \
     --data '<propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>' >/dev/null 2>&1; then
    info "WebDAV 服务（HTTP 明文 · 安卓端）验证通过 ✅"
  else
    warn "明文端口 ${PORT_PLAIN} 本地验证未通过，请检查容器日志：docker compose logs webdav"
  fi

  echo
  echo -e "${GREEN}==================================================${NC}"
  echo -e "${GREEN} 部署完成！请在 Obsidian 插件中填写以下地址：${NC}"
  echo -e "${GREEN}   电脑端: https://${SERVER_IP}:${PORT}/${NC}"
  echo -e "${GREEN}   安卓端: http://${SERVER_IP}:${PORT_PLAIN}/${NC}"
  echo -e "${GREEN}   用户名: ${WEBDAV_USER}${NC}"
  echo -e "${GREEN}   密码: ******（你设置的密码）${NC}"
  echo -e "${GREEN}==================================================${NC}"
  echo
  echo -e "${YELLOW}注意 1：8080 的证书为自签名，桌面端首次连接需信任该证书（见使用说明 3.6）。${NC}"
  echo -e "${YELLOW}注意 2：8081 是明文端口，密码仅做 Base64 编码（等同明文），仅供无法信任证书的手机使用；${NC}"
  echo -e "${YELLOW}        不需要时可删掉 docker-compose.yml 里的 \"${PORT_PLAIN}:${PORT_PLAIN}\" 与 nginx.conf 中对应 server 块。${NC}"
  echo -e "${YELLOW}注意 3：请在云厂商安全组入方向放行 TCP ${PORT} 与 TCP ${PORT_PLAIN}。${NC}"
  echo "常用命令："
  echo "  查看日志:  docker compose logs -f webdav"
  echo "  停止服务:  docker compose down"
  echo "  重启服务:  docker compose restart"
}

# ---------- 主流程 ----------
main() {
  info "开始部署 Obsidian 私有 WebDAV 同步服务 ..."
  ensure_docker
  prepare_data
  setup_credentials
  open_firewall
  start_service
  verify
}

main "$@"
