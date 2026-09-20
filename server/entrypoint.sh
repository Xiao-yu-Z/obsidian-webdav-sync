#!/bin/sh
# 容器启动脚本：若未提供 htpasswd / 证书，则根据环境变量 / 自动生成
set -e

# ---------- 修正 /data 属主（关键，否则写入全失败）----------
# /data 通常由宿主机目录（./data）bind mount 进来，其属主是 root:root。
# 而 nginx worker 以 nginx 用户运行，bind mount 又会覆盖镜像构建时的 chown，
# 结果就是「能读不能写」，表现为：
#   PUT   → 500 Internal Server Error
#   MKCOL → 403 Forbidden
# 因此每次启动都重新把 /data 交给 nginx 用户（容器以 root 身份执行本脚本）。
mkdir -p /data
chown -R nginx:nginx /data 2>/dev/null || true

# 当未挂载现成 htpasswd 且提供了账号密码环境变量时，自动生成
if [ ! -f /etc/nginx/.htpasswd ] && [ -n "$WEBDAV_USER" ] && [ -n "$WEBDAV_PASS" ]; then
    echo "生成 htpasswd 认证文件 (用户: $WEBDAV_USER) ..."
    htpasswd -bc /etc/nginx/.htpasswd "$WEBDAV_USER" "$WEBDAV_PASS"
fi

# 若未挂载受信任证书，则自动生成自签名证书，确保密码以 TLS 加密传输。
#
# 生成规范（很重要，否则客户端「导入信任后仍会被拒」）：
#   - subjectAltName：现代浏览器/Electron 已不再看 CN，必须把访问用的 IP/域名写进 SAN；
#   - basicConstraints=CA:TRUE：Chromium 只接受带 CA 标记的证书作为信任锚；
#   - keyUsage / extendedKeyUsage：补齐标准扩展，避免校验器拒绝。
# 用 IP 直连时，请把服务器公网 IP 通过环境变量 TLS_SAN_IP 传入（支持逗号分隔多个）。
# 追求零信任弹窗请替换为 Let's Encrypt 等受信任证书挂载到 ./ssl（见使用说明 3.6）。
if [ ! -f /etc/nginx/ssl/fullchain.pem ] || [ ! -f /etc/nginx/ssl/privkey.pem ]; then
    echo "未检测到 TLS 证书，正在生成自签名证书（带 SAN / CA 标记，便于客户端信任）..."
    mkdir -p /etc/nginx/ssl

    SAN="DNS:localhost,IP:127.0.0.1"
    if [ -n "${TLS_SAN_IP:-}" ]; then
        for ip in $(echo "$TLS_SAN_IP" | tr ',' ' '); do
            SAN="$SAN,IP:$ip"
        done
    fi

    openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
        -keyout /etc/nginx/ssl/privkey.pem \
        -out /etc/nginx/ssl/fullchain.pem \
        -subj "/CN=obsidian-webdav" \
        -addext "subjectAltName=$SAN" \
        -addext "basicConstraints=critical,CA:TRUE" \
        -addext "keyUsage=critical,keyCertSign,digitalSignature,keyEncipherment" \
        -addext "extendedKeyUsage=serverAuth"
    chown -R nginx:nginx /etc/nginx/ssl
    echo "自签名证书已生成：/etc/nginx/ssl/（SAN: $SAN）"
fi

echo "启动 Nginx WebDAV 服务（HTTPS）..."
exec nginx -g 'daemon off;'
