/**
 * main.ts — 插件主入口
 *
 * 职责：
 *  - 注册设置面板、状态栏图标、左侧边栏同步按钮、命令面板命令；
 *  - 监听本地文件的 create / modify / delete / rename 事件（带 300ms 防抖）；
 *  - 初始化同步引擎并管理同步状态（含「同步中」标志以屏蔽自身写回导致的事件回环）；
 *  - 提供「立即同步」命令与按钮，以及定时同步。
 *
 * 兼容性：isDesktopOnly=false，使用 requestUrl / vault.adapter / crypto.subtle，
 * 可在 Windows / macOS / Linux 桌面端与 iOS / Android 移动端 Obsidian 运行。
 */

import { Notice, Plugin, TFile, TAbstractFile, setIcon, Modal, App, Setting, Platform } from "obsidian";
import { SyncSettingTab } from "./settings";
import { SyncEngine, describeNetworkError } from "./syncEngine";
import {
  DEFAULT_SETTINGS,
  SyncSettings,
  SyncIndex,
  SyncProgress,
  SyncStatus,
} from "./types";

export default class WebDavSyncPlugin extends Plugin {
  settings: SyncSettings;
  index: SyncIndex;
  engine: SyncEngine;

  statusBarItem: HTMLElement | null = null;
  ribbonItem: HTMLElement | null = null;
  /** 密码内存缓存：默认不落盘；rememberPassword=false 时仅存此处，重启后需重输 */
  passwordCache: string = "";
  private syncTimer: number | null = null;
  private debounceTimer: number | null = null;
  /** 正在同步中，避免引擎写回文件时触发本地事件造成回环 */
  syncing = false;
  /** 移动端同步进度提示（顶部常驻 Notice），桌面端用状态栏即可 */
  progressNotice: Notice | null = null;
  /** 设置页「立即同步」按钮引用，用于实时反映进度（无论由谁触发同步） */
  activeSyncButton: HTMLButtonElement | null = null;

  /* ---------------- 生命周期 ---------------- */

  async onload(): Promise<void> {
    await this.loadSettings();
    this.engine = new SyncEngine(this);
    this.engine.onProgress = (p) => this.onSyncProgress(p);

    // 状态栏
    this.refreshStatusBarVisibility();

    // 左侧边栏（功能区）同步按钮
    this.refreshRibbonVisibility();
    this.updateRibbon("idle");

    // 设置面板
    this.addSettingTab(new SyncSettingTab(this.app, this));

    // 命令面板：立即同步
    this.addCommand({
      id: "wbav-sync-now",
      name: "立即同步",
      callback: () => this.syncNow(),
    });
    // 命令面板：切换实时同步
    this.addCommand({
      id: "wbav-toggle-realtime",
      name: "切换实时同步开关",
      callback: () => this.toggleRealtime(),
    });
    // 命令面板：查看状态
    this.addCommand({
      id: "wbav-status",
      name: "显示同步状态",
      callback: () =>
        new Notice(
          `上次同步：${
            this.index.lastSyncTime
              ? new Date(this.index.lastSyncTime).toLocaleString()
              : "尚未同步"
          }`
        ),
    });

    // 监听本地文件事件（带 300ms 防抖）
    this.registerEvent(
      this.app.vault.on("create", (f) => this.onLocalChange(f))
    );
    this.registerEvent(
      this.app.vault.on("modify", (f) => this.onLocalChange(f))
    );
    this.registerEvent(
      this.app.vault.on("delete", (f) => this.onLocalChange(f))
    );
    this.registerEvent(
      this.app.vault.on("rename", (_f, oldPath) => this.onLocalChangeByName(oldPath))
    );

    // 启动定时同步
    this.restartInterval();

    // 启动时若已配置则自动做一次同步
    if (this.settings.serverUrl) {
      // 延迟到 vault 就绪后执行
      setTimeout(() => this.syncNow(), 3000);
    }
  }

  onunload(): void {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /* ---------------- 配置持久化 ---------------- */

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || {});
    this.index = data?.index || { version: 1, lastSyncTime: 0, files: {} };
    // 密码策略：未勾选「记住密码」时，绝不把密码载入内存（旧版遗留的明文也丢弃）
    if (this.settings.rememberPassword) {
      this.passwordCache = this.settings.password || "";
    } else {
      this.settings.password = "";
      this.passwordCache = "";
    }
  }

  async saveSettings(): Promise<void> {
    // 默认不把密码写入磁盘；仅当明确勾选「记住密码」时才持久化（仍为明文）
    const settingsToSave = { ...this.settings };
    if (!this.settings.rememberPassword) {
      settingsToSave.password = "";
    }
    await this.saveData({ settings: settingsToSave, index: this.index });
  }

  /**
   * 获取用于本次同步的密码：
   *  - 内存已有则直接返回（避免反复弹窗）；
   *  - 没有则弹出输入框让用户输入，并缓存到内存。
   * 这样在不勾选「记住密码」时，密码既不会落盘，也只需输入一次即可完成整轮同步。
   */
  async getPassword(): Promise<string> {
    if (this.passwordCache) return this.passwordCache;
    return new Promise<string>((resolve) => {
      new PasswordPromptModal(this.app, this, (value) => {
        this.passwordCache = value;
        resolve(value);
      }).open();
    });
  }

  /* ---------------- 事件处理 ---------------- */

  /** 本地文件变更回调（创建/修改/删除） */
  private onLocalChange(file: TAbstractFile): void {
    if (file instanceof TFile) {
      this.onLocalChangeByName(file.path);
    } else {
      this.onLocalChangeByName(file.path);
    }
  }

  /** 按路径触发（含 rename 旧路径） */
  private onLocalChangeByName(_path: string): void {
    if (!this.settings.enableRealtime) return;
    if (this.syncing) return; // 同步写回阶段忽略
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.syncNow();
    }, 300);
  }

  /* ---------------- 同步控制 ---------------- */

  async syncNow(): Promise<void> {
    if (this.syncing) return;
    if (!this.settings.serverUrl) {
      new Notice("请先在设置中填写 WebDAV 服务器地址");
      return;
    }
    try {
      await this.engine.sync();
    } catch (e) {
      // 错误已在引擎内上报；移动端通过顶部进度提示（progressNotice）展示，避免重复弹窗
      if (!Platform.isMobile) {
        new Notice("同步出错：" + describeNetworkError(e));
      }
    }
  }

  private toggleRealtime(): void {
    this.settings.enableRealtime = !this.settings.enableRealtime;
    this.saveSettings();
    new Notice(
      "实时同步已" + (this.settings.enableRealtime ? "开启" : "关闭")
    );
  }

  /** 重启定时同步定时器（间隔改变时调用） */
  restartInterval(): void {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    const mins = this.settings.syncInterval;
    if (mins > 0) {
      this.syncTimer = window.setInterval(
        () => this.syncNow(),
        mins * 60 * 1000
      );
    }
  }

  /* ---------------- 状态栏 ---------------- */

  refreshStatusBarVisibility(): void {
    if (this.settings.statusBarEnabled) {
      if (!this.statusBarItem) {
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass("wbav-statusbar");
        this.updateStatusBar("idle", "未同步");
      }
    } else if (this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = null;
    }
  }

  private updateStatusBar(status: SyncStatus, message: string): void {
    if (!this.statusBarItem) return;
    const icon =
      status === "syncing"
        ? "sync"
        : status === "success"
        ? "check"
        : status === "error"
        ? "alert-triangle"
        : status === "offline"
        ? "wifi-off"
        : "cloud";
    this.statusBarItem.empty();
    const iconEl = this.statusBarItem.createSpan({ cls: "wbav-icon" });
    setIcon(iconEl, icon);
    const textEl = this.statusBarItem.createSpan({
      cls: "wbav-text",
      text: " " + message,
    });
    // 点击状态栏触发一次同步
    this.statusBarItem.setAttribute("aria-label", "点击立即同步");
    this.statusBarItem.onClickEvent(() => this.syncNow());
  }

  /* ---------------- 左侧边栏（功能区）按钮 ---------------- */

  /** 根据设置创建 / 移除左侧边栏的同步按钮 */
  refreshRibbonVisibility(): void {
    if (this.settings.ribbonEnabled) {
      if (!this.ribbonItem) {
        // addRibbonIcon 会在左侧功能区生成一个可点击图标
        this.ribbonItem = this.addRibbonIcon(
          "refresh-cw",
          "WebDAV Sync：点击立即同步",
          () => this.syncNow()
        );
        this.ribbonItem.addClass("wbav-ribbon");
      }
    } else if (this.ribbonItem) {
      this.ribbonItem.remove();
      this.ribbonItem = null;
    }
  }

  /** 按同步状态刷新边栏图标：同步中旋转、成功后短暂显示对勾 */
  private updateRibbon(status: SyncStatus): void {
    if (!this.ribbonItem) return;
    const icon =
      status === "syncing"
        ? "refresh-cw"
        : status === "success"
        ? "check"
        : status === "error"
        ? "alert-triangle"
        : status === "offline"
        ? "wifi-off"
        : "refresh-cw";
    const label =
      status === "syncing"
        ? "WebDAV Sync：同步中…"
        : status === "success"
        ? "WebDAV Sync：同步完成，点击再次同步"
        : status === "error"
        ? "WebDAV Sync：同步出错，点击重试"
        : status === "offline"
        ? "WebDAV Sync：已跳过（非 WiFi 网络）"
        : "WebDAV Sync：点击立即同步";

    setIcon(this.ribbonItem, icon);
    this.ribbonItem.toggleClass("wbav-spin", status === "syncing");
    this.ribbonItem.setAttribute("aria-label", label);
    this.ribbonItem.setAttribute("title", label);
  }

  private onSyncProgress(p: SyncProgress): void {
    this.updateStatusBar(p.status, p.message);
    this.updateRibbon(p.status);

    // 设置页「立即同步」按钮实时反映进度（无论同步由谁触发：边栏/命令/自动/实时）
    if (this.activeSyncButton) {
      if (p.status === "syncing") {
        this.activeSyncButton.disabled = true;
        // 直接把「已处理/总数」显示在按钮上（如 718/1913），让进度一眼可见，
        // 而不是只显示笼统的"同步中…"。消息里没有数字时（准备阶段）退回"同步中…"。
        const m = /(\d+)\s*\/\s*(\d+)/.exec(p.message);
        this.activeSyncButton.textContent = m ? `${m[1]}/${m[2]}` : "同步中…";
      } else {
        this.activeSyncButton.disabled = false;
        this.activeSyncButton.textContent = "立即同步";
      }
    }

    // 移动端：顶部常驻提示实时显示进度（手机上没有明显的状态栏，必须用 Notice 才看得见）
    if (Platform.isMobile) {
      if (p.status === "syncing") {
        if (!this.progressNotice) {
          // 0 = 常驻不自动消失，自行在结束时收起
          this.progressNotice = new Notice(p.message, 0);
        } else {
          this.progressNotice.setMessage(p.message);
        }
      } else {
        // success / error / offline：更新为最终结果，几秒后收起
        if (this.progressNotice) {
          const n = this.progressNotice;
          this.progressNotice = null;
          n.setMessage(p.message);
          setTimeout(() => n.hide(), 4000);
        } else if (p.status === "error" || p.status === "offline") {
          // 极快结束或离线跳过时，没有进行中提示也补一条结果提示
          new Notice(p.message, 5000);
        }
      }
    }
  }
}

/**
 * 密码输入弹窗：在不勾选「记住密码」时，同步前弹出让用户输入 WebDAV 密码。
 * 输入内容以密文显示，仅缓存到内存，不写入磁盘。
 */
class PasswordPromptModal extends Modal {
  private value = "";
  private onSubmit: (value: string) => void;
  private plugin: WebDavSyncPlugin;

  constructor(app: App, plugin: WebDavSyncPlugin, onSubmit: (value: string) => void) {
    super(app);
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "输入 WebDAV 密码" });
    const user = this.plugin.settings.username || "(未设置账号)";
    contentEl.createEl("p", {
      text: `账号：${user}　（密码仅本次保存在内存，不会写入磁盘）`,
      cls: "wbav-hint",
    });

    let inputEl: HTMLInputElement | null = null;
    new Setting(contentEl)
      .setName("密码")
      .addText((text) => {
        // TextComponent 无 setSecret()，用 input 类型实现密文显示
        text.inputEl.type = "password";
        text
          .setPlaceholder("请输入 WebDAV 密码")
          .onChange((v) => (this.value = v));
        inputEl = text.inputEl;
      });

    new Setting(contentEl)
      .addButton((btn) =>
        btn
          .setButtonText("确定")
          .setCta()
          .onClick(() => {
            this.close();
            this.onSubmit(this.value);
          })
      )
      .addButton((btn) =>
        btn.setButtonText("取消").onClick(() => {
          this.close();
          this.onSubmit("");
        })
      );

    // 自动聚焦密码框
    setTimeout(() => inputEl?.focus(), 30);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
