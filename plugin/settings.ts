/**
 * settings.ts — 设置面板与配置管理
 *
 * - 通过 Obsidian 原生 PluginSettingTab 渲染界面；
 * - 所有配置项写入 plugin.settings，并由插件统一通过 saveData/loadData 持久化；
 * - 配置项完全覆盖需求：服务器地址、账号密码、同步间隔、实时同步、仅 WiFi（移动端）、
 *   忽略规则、冲突处理策略、状态栏开关、左侧边栏同步按钮开关；
 * - 提供「连接测试」按钮，复用引擎的 WebDAV 探测能力。
 */

import { App, Notice, PluginSettingTab, Setting, Platform } from "obsidian";
import WebDavSyncPlugin from "./main";
import { DEFAULT_SETTINGS } from "./types";

/**
 * 构建标识：每次关键修复后更新。
 * 作用：显示在设置面板顶部，用来确认 Obsidian 当前加载的是哪一个版本——
 * 若看到的不是最新标识，说明 Obsidian 还在跑旧代码（需要彻底退出后重开）。
 */
export const PLUGIN_BUILD = "v1.4.2 · 跳过元数据/回收区(2026-09-17)";

export class SyncSettingTab extends PluginSettingTab {
  plugin: WebDavSyncPlugin;

  constructor(app: App, plugin: WebDavSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    // 重新渲染时清掉旧按钮引用，避免更新到一个已失效的 DOM 节点
    this.plugin.activeSyncButton = null;

    containerEl.createEl("h2", { text: "WebDAV 同步设置" });
    containerEl.createEl("p", {
      text: "将 Obsidian 笔记通过私有 WebDAV 服务在桌面端与移动端之间双向同步。",
      cls: "wbav-hint",
    });
    containerEl.createEl("p", {
      text: `当前插件版本：${PLUGIN_BUILD}　—　若这里显示的不是该版本号，说明 Obsidian 仍在运行旧代码，请彻底退出后重新打开。`,
      cls: "wbav-hint",
    });

    /* ---------------- 同步操作（顶部按钮，移动端无需去找边栏图标） ---------------- */
    new Setting(containerEl)
      .setName("立即同步")
      .setDesc("手动触发一次双向同步。首次会弹窗要求输入 WebDAV 密码；可反复点击。")
      .addButton((button) => {
        this.plugin.activeSyncButton = button.buttonEl;
        button
          .setButtonText("立即同步")
          .setCta()
          .onClick(async () => {
            if (button.disabled) return;
            button.setDisabled(true);
            button.setButtonText("同步中…");
            try {
              await this.plugin.syncNow();
            } catch (e) {
              // 移动端由顶部进度提示统一展示，避免重复弹窗
              if (!Platform.isMobile) {
                new Notice("❌ 同步失败：" + (e instanceof Error ? e.message : String(e)));
              }
            } finally {
              button.setDisabled(false);
              button.setButtonText("立即同步");
            }
          });
      });

    /* ---------------- 基础连接 ---------------- */
    new Setting(containerEl)
      .setName("服务器地址")
      .setDesc(
        "WebDAV 根地址，需以 / 结尾。例如 https://sync.example.com:8080/（不写 http(s):// 时默认按 http:// 处理）"
      )
      .addText((text) =>
        text
          .setPlaceholder("https://sync.example.com:8080/")
          .setValue(this.plugin.settings.serverUrl)
          .onChange(async (value) => {
            this.plugin.settings.serverUrl = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("用户名")
      .setDesc("WebDAV 账号（服务端 htpasswd 中配置）")
      .addText((text) =>
        text
          .setPlaceholder("obsidian")
          .setValue(this.plugin.settings.username)
          .onChange(async (value) => {
            this.plugin.settings.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("密码")
      .setDesc(
        "WebDAV 密码。默认不写入磁盘，仅在本次运行内存中保存，重启 Obsidian 后首次同步会要求重新输入；如需免去重输，请打开下面的「记住密码」（将以明文存于本地）。"
      )
      .addText((text) => {
        // 注意：Obsidian 的 TextComponent 没有 setSecret() 方法（那是 SecretStorage 的 API），
        // 误用会在渲染设置面板时抛异常并中断后续所有设置项，直接把 input 类型设为 password 最稳妥。
        text.inputEl.type = "password";
        text
          .setPlaceholder("••••••••")
          .setValue(this.plugin.settings.password)
          .onChange(async (value) => {
            this.plugin.settings.password = value;
            this.plugin.passwordCache = value; // 立即缓存到内存，确保本轮同步可用
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("记住密码")
      .setDesc(
        "开启后，密码会以明文保存在本地 vault（data.json），重启后无需重输；仅在服务端已启用 HTTPS 时建议开启。关闭则密码绝不落盘，最安全。"
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.rememberPassword)
          .onChange(async (value) => {
            this.plugin.settings.rememberPassword = value;
            if (!value) {
              // 关闭记住：立即从磁盘清掉已保存的密码（内存缓存仍保留，本次会话继续可用）
              this.plugin.settings.password = "";
            }
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("连接测试")
      .setDesc("验证服务器地址与账号密码是否可用")
      .addButton((button) =>
        button.setButtonText("测试连接").onClick(async () => {
          button.setDisabled(true);
          button.setButtonText("测试中…");
          try {
            await this.plugin.engine.testConnection();
            new Notice("✅ 连接成功，WebDAV 服务可用");
          } catch (e) {
            new Notice(
              "❌ 连接失败：" + (e instanceof Error ? e.message : String(e))
            );
          } finally {
            button.setDisabled(false);
            button.setButtonText("测试连接");
          }
        })
      );

    /* ---------------- 同步策略 ---------------- */
    new Setting(containerEl)
      .setName("定时同步间隔（分钟）")
      .setDesc("每隔多少分钟自动同步一次，0 表示关闭定时同步")
      .addText((text) =>
        text
          .setPlaceholder("15")
          .setValue(String(this.plugin.settings.syncInterval))
          .onChange(async (value) => {
            const n = parseInt(value, 10);
            this.plugin.settings.syncInterval = isNaN(n) ? 0 : Math.max(0, n);
            await this.plugin.saveSettings();
            this.plugin.restartInterval();
          })
      );

    new Setting(containerEl)
      .setName("实时同步")
      .setDesc("开启后，本地文件创建/修改/删除/重命名将自动触发同步")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableRealtime)
          .onChange(async (value) => {
            this.plugin.settings.enableRealtime = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("仅 WiFi 同步（移动端）")
      .setDesc("移动端仅在 WiFi / 有线网络下同步，避免消耗手机流量（桌面端无效）")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.wifiOnly)
          .onChange(async (value) => {
            this.plugin.settings.wifiOnly = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("状态栏显示")
      .setDesc("在 Obsidian 底部状态栏显示同步状态图标")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.statusBarEnabled)
          .onChange(async (value) => {
            this.plugin.settings.statusBarEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.refreshStatusBarVisibility();
          })
      );

    new Setting(containerEl)
      .setName("左侧边栏同步按钮")
      .setDesc("在 Obsidian 左侧边栏（功能区）显示一个同步图标，点击即可立即同步")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.ribbonEnabled)
          .onChange(async (value) => {
            this.plugin.settings.ribbonEnabled = value;
            await this.plugin.saveSettings();
            this.plugin.refreshRibbonVisibility();
          })
      );

    /* ---------------- 冲突处理 ---------------- */
    new Setting(containerEl)
      .setName("冲突处理策略")
      .setDesc(
        "当同一文件在两端都被修改时如何处理：最新优先 / 本地优先 / 远端优先 / 双版本保留"
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("latest", "最新优先（按修改时间）")
          .addOption("local", "本地优先")
          .addOption("remote", "远端优先")
          .addOption("dual", "双版本保留")
          .setValue(this.plugin.settings.conflictStrategy)
          .onChange(async (value) => {
            this.plugin.settings.conflictStrategy = value as any;
            await this.plugin.saveSettings();
          })
      );

    /* ---------------- 忽略规则 ---------------- */
    new Setting(containerEl)
      .setName("忽略规则")
      .setDesc(
        "每行一条 glob 规则。默认已忽略 .obsidian/workspace.json、.obsidian/workspace、.trash、.DS_Store、*.tmp"
      )
      .addTextArea((textarea) =>
        textarea
          .setPlaceholder(".obsidian/workspace.json\n.tmp\n.secret/**")
          .setValue(this.plugin.settings.ignoreRules)
          .onChange(async (value) => {
            this.plugin.settings.ignoreRules = value;
            await this.plugin.saveSettings();
          })
      )
      .then((setting) => {
        // 让文本框更宽更高
        setting.components.forEach((c) => {
          const el = (c as any).inputEl as HTMLTextAreaElement;
          if (el) {
            el.rows = 6;
            el.style.width = "100%";
            el.style.fontFamily = "var(--font-monospace)";
          }
        });
      });

    containerEl.createEl("hr");
    containerEl.createEl("p", {
      text: "提示：首次使用建议先在「连接测试」通过后，再手动点一次「立即同步」命令完成全量同步。",
      cls: "wbav-hint",
    });
  }
}
