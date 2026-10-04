# obsidian-webdav-sync

> 一套完全跑在**你自己服务器**上的 Obsidian 双向同步方案。桌面端（Windows / macOS / Linux）与移动端（iOS / Android）通用，不依赖任何第三方同步服务，笔记 100% 存储在自己的服务器磁盘上。

[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![obsidian](https://img.shields.io/badge/Obsidian-1.0%2B-purple)
![webdav](https://img.shields.io/badge/protocol-WebDAV-00599d)
![server](https://img.shields.io/badge/server-nginx%20%2B%20docker-orange)

---

## 这是什么

一个 **Obsidian 插件** + 一份 **Nginx/Docker 服务端配置**，两者通过标准 WebDAV 协议通信，实现多设备之间的最终一致双向同步。

- 桌面端与移动端装的是**同一个插件**（`plugin/` 与 `obsidian-webdav-sync-android.zip` 内容一致）
- 服务端只是一个轻量 Nginx 容器，笔记以普通文件形式落在服务器磁盘上，随时可用 SSH / rsync / 备份工具直接取走
- 最低配置 **1 核 256MB** 即可跑（实测验证）

## 核心特性

| 特性 | 说明 |
| --- | --- |
| **增量同步** | 只对内容变更过的文件计算 SHA-256，未改动文件跳过；配合服务器元数据索引避免重复传输 |
| **删除可跨端传播** | 删除写入「墓碑」记录，删除能同步到所有设备，且不会因为某台设备重新上传而「复活」 |
| **秒过空转** | 两端都没变化时，一次 HEAD 请求（约 0.2s）即结束同步，不做全量扫描 |
| **冲突策略可选** | 最新优先 / 本地优先 / 远端优先 / 双版本保留（保留双方版本不丢内容） |
| **忽略规则** | 支持 glob 通配（`*.tmp`、`我的私密笔记/**`），插件元数据与回收区自动跳过 |
| **批量删除保护** | 单次删除超过阈值时自动跳过并提示，避免网络异常导致整库被清空 |
| **密码不落盘** | 默认仅存在内存中，重启后需重输；可选「记住密码」 |
| **移动端友好** | 定时同步、仅 WiFi 同步、实时同步（300ms 防抖） |

## 快速开始

### 1️⃣ 部署服务器

把 `server/` 目录传到服务器，然后：

```bash
cd server
sudo bash deploy.sh
```

脚本会自动安装 Docker、询问账号密码、放行端口、构建并启动 Nginx + WebDAV 容器（`restart: always`），最后打印访问地址。默认开启 HTTPS（首次启动自动生成自签名证书）。

| 端口 | 协议 | 用途 |
| --- | --- | --- |
| `8080` | HTTPS | 桌面端（加密传输，首选） |
| `8081` | HTTP 明文 | 安卓端（Android 7+ 不信任用户自签证书，见下方说明） |

### 2️⃣ 安装插件

**桌面端**：把 `plugin/` 下的 `manifest.json`、`main.js`、`styles.css` 三个文件复制到
`<你的库>/.obsidian/plugins/obsidian-webdav-sync/`，然后在 Obsidian「设置 → 第三方插件」中启用。

**安卓端**：把仓库根目录的 `obsidian-webdav-sync-android.zip` 传到手机，解压到
`Android/data/com.obsidian.md/files/<你的库名>/.obsidian/plugins/`（Android 11+ 建议用 MT 管理器访问），再启用插件。

**iOS**：用「文件」App / 隔空投送把 `obsidian-webdav-sync/` 文件夹放进库的 `.obsidian/plugins/`。

### 3️⃣ 配置连接

Obsidian → 设置 → 第三方插件 → **WebDAV Sync**：

| 设置项 | 填写 | 示例 |
| --- | --- | --- |
| 服务器地址 | **必须以 `/` 结尾** | 桌面 `https://<你的IP>:8080/`<br>安卓 `http://<你的IP>:8081/` |
| 用户名 | 部署时设置的用户名 | `obsidian` |
| 密码 | 部署时设置的密码 | 点「测试连接」时弹窗输入 |

点「测试连接」出现 `✅ 连接成功`，即可点「立即同步」。

> 💡 **为什么手机要单独用 8081**：Android 7+ 的 App 默认不信任用户手动安装的证书，自签名 HTTPS 证书在手机上会被直接拒绝。8081 是明文端口（密码仅 Base64 编码，**不是加密**），仅建议自用场景；需要全加密请把 Let's Encrypt 正式证书放进 `server/ssl/`。

## 目录结构

```
.
├── README.md                    # 本文件（项目首页）
├── 使用说明.md                  # 完整手册：部署详解、配置项、排错、安全建议
├── obsidian-webdav-sync-android.zip   # 安卓安装包（解压到 .obsidian/plugins/）
├── android-push/                # 上面 zip 的解压源
├── plugin/                      # Obsidian 插件（main.js 已编译，开箱即用）
│   ├── manifest.json / main.js / styles.css
│   ├── main.ts / settings.ts / syncEngine.ts / types.ts   # TypeScript 源码
│   └── package.json / tsconfig.json / esbuild.config.mjs
├── server/                      # 服务端一键部署
│   ├── deploy.sh                # 一键部署（OpenCloudOS / RHEL / Debian 通用）
│   ├── docker-compose.yml
│   ├── Dockerfile               # 构建含 WebDAV 模块的 Nginx 镜像
│   ├── nginx.conf               # HTTPS 8080 + 手机明文 8081
│   ├── entrypoint.sh            # 生成认证文件 + 自签名证书
│   ├── diagnose.sh              # 部署后自检
│   └── .env.example             # 环境变量示例（复制为 .env 后填写）
├── tools/                       # 维护脚本（可选，纯标准库 Python）
│   ├── dav.py                   # 最小 WebDAV 客户端（ls/get/put/mkcol/move/rm）
│   ├── plan_cleanup.py          # 只读：生成待清理清单
│   ├── backup_targets.py        # 备份到服务器回收区
│   ├── verify_backup.py         # 逐字节校验备份
│   ├── fix_index.py             # 重写索引：清幽灵记录 + 写删除墓碑
│   ├── verify_final.py          # 终态校验
│   └── restore_trash.py         # 一键还原回收区批次
├── sim_tombstone.py             # 同步算法（墓碑/冲突/删除保护）离线仿真测试
└── .gitignore
```

## 从源码构建插件

```bash
cd plugin
npm install
npm run build          # 产出 main.js
```

把 `manifest.json` / `main.js` / `styles.css` 拷到 vault 的 `.obsidian/plugins/obsidian-webdav-sync/` 即可。

## 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| 同步没反应 / 远端列表为空 | 服务器地址没以 `/` 结尾；先用浏览器打开该地址看是否要账号密码 |
| 电脑能连、手机连不上 | 手机应填 `http://` + **8081** 端口，不是 8080 |
| 安卓解压后插件不出现 | 目录层级必须是 `.obsidian/plugins/obsidian-webdav-sync/main.js`；Android 11+ 用 MT 管理器 |
| 提示「检测到大量删除，已跳过」 | 批量删除保护触发。若确认是有意删除，可在设置里确认远端列表正常后重试 |
| 文件被重复上传 / 索引不一致 | 见《使用说明.md》七章排错，或用 `tools/verify_final.py` 诊断 |

更多排错、安全与备份建议见 **[使用说明.md](使用说明.md)**。

## 适用与不适用

**适合：**
- 个人多设备（电脑 + 手机）同步笔记
- 数据必须自持、不想用 iCloud / Dropbox / 坚果云
- 服务器配置较低（1 核 256MB 起）

**不适合 / 需谨慎：**
- 多人**实时协作**编辑同一篇笔记（本方案是最终一致同步，不是实时协同）
- 完全不懂命令行、无人协助部署服务器
- 无自有服务器且不愿租用

## 安全须知

- 部署时设置的 WebDAV 密码保存在服务器 `.env`（权限 600），**不在本仓库中**；本仓库也不含任何真实地址或凭据
- 桌面端请优先使用 HTTPS（8080）；8081 明文端口仅供无法信任自签证书的安卓端自用
- 服务端数据在 `server/data/`，建议配 `crontab` 定时备份（见《使用说明.md》八章）

## License

[MIT](LICENSE)
