# 基于 Alpine 官方基础镜像，自行安装 nginx + WebDAV 扩展模块（含 PROPFIND / OPTIONS）。
#
# 为什么不用官方 nginx:alpine 镜像：
#   该镜像里的 nginx 来自 nginx.org 仓库并被锁定（如 1.31.6-r1），而 Alpine 仓库中的
#   nginx-mod-http-dav-ext 是针对 Alpine 自带 nginx 编译的（v3.24 为 1.30.4-r1），
#   两者版本不匹配，安装时会报：
#     nginx-1.31.6-r1 breaks: nginx-mod-http-dav-ext-1.30.4-r1[nginx=1.30.4-r1]
#   从 alpine 基础镜像把 nginx 与模块一起装，版本天然一致，不再冲突。
FROM alpine:3.24

# 切换 Alpine 软件源为国内镜像后再装包：
# 默认源 dl-cdn.alpinelinux.org 在部分国内网络下会 TLS 握手失败（TLS: unspecified error），
# 导致 apk 拉不到索引。这里按「腾讯云内网 → 阿里云 → 清华」顺序自动择一。
# 安装内容：
#   nginx                    WebDAV 服务本体
#   nginx-mod-http-dav-ext   提供 PROPFIND / OPTIONS 等扩展方法，
#                            .so 位于 /usr/lib/nginx/modules/ngx_http_dav_ext_module.so
#   apache2-utils            提供 htpasswd（生成账号密码）
#   openssl                  生成自签名 TLS 证书
RUN set -eux; \
    ver="$(cut -d. -f1,2 /etc/alpine-release)"; \
    for m in "http://mirrors.tencentyun.com/alpine" "https://mirrors.aliyun.com/alpine" "https://mirrors.tuna.tsinghua.edu.cn/alpine"; do \
        printf '%s/v%s/main\n%s/v%s/community\n' "$m" "$ver" "$m" "$ver" > /etc/apk/repositories; \
        if apk update >/dev/null 2>&1; then echo ">> 使用 Alpine 源: $m"; break; fi; \
        echo ">> 源不可用，尝试下一个: $m"; \
    done; \
    apk add --no-cache nginx nginx-mod-http-dav-ext apache2-utils openssl; \
    mkdir -p /data /tmp/client_temp /etc/nginx/ssl /var/log/nginx /var/lib/nginx; \
    chown -R nginx:nginx /data /tmp/client_temp /etc/nginx/ssl /var/log/nginx /var/lib/nginx

# 复制配置与启动脚本（覆盖 Alpine 默认 nginx.conf）
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
