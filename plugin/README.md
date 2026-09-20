# Obsidian WebDAV Sync 插件

私有 WebDAV 双向同步插件，支持桌面端（Windows / macOS / Linux）与移动端（iOS / Android）。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `manifest.json` | 插件清单 |
| `main.ts` | 主入口：命令、状态栏、文件事件监听 |
| `settings.ts` | 设置面板与配置持久化 |
| `syncEngine.ts` | 核心同步引擎（WebDAV 客户端 + 哈希校验 + 冲突处理） |
| `types.ts` | 类型定义 |
| `styles.css` | 样式 |
| `main.js` | 已编译产物（开箱即用） |

## 构建（开发用）

```bash
npm install
npm run build   # 生成 main.js
```

## 安装到 Obsidian

将以下文件复制到 vault 的 `.obsidian/plugins/obsidian-webdav-sync/` 目录：

```
manifest.json
main.js
styles.css
```

然后在 Obsidian「设置 → 第三方插件」中启用。详见《使用说明.md》。
