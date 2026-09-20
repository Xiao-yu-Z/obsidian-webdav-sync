/* Obsidian WebDAV Sync - bundled with esbuild */
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => WebDavSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian3 = require("obsidian");

// settings.ts
var import_obsidian = require("obsidian");
var PLUGIN_BUILD = "v1.4.2 \xB7 \u8DF3\u8FC7\u5143\u6570\u636E/\u56DE\u6536\u533A(2026-09-17)";
var SyncSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    this.plugin.activeSyncButton = null;
    containerEl.createEl("h2", { text: "WebDAV \u540C\u6B65\u8BBE\u7F6E" });
    containerEl.createEl("p", {
      text: "\u5C06 Obsidian \u7B14\u8BB0\u901A\u8FC7\u79C1\u6709 WebDAV \u670D\u52A1\u5728\u684C\u9762\u7AEF\u4E0E\u79FB\u52A8\u7AEF\u4E4B\u95F4\u53CC\u5411\u540C\u6B65\u3002",
      cls: "wbav-hint"
    });
    containerEl.createEl("p", {
      text: `\u5F53\u524D\u63D2\u4EF6\u7248\u672C\uFF1A${PLUGIN_BUILD}\u3000\u2014\u3000\u82E5\u8FD9\u91CC\u663E\u793A\u7684\u4E0D\u662F\u8BE5\u7248\u672C\u53F7\uFF0C\u8BF4\u660E Obsidian \u4ECD\u5728\u8FD0\u884C\u65E7\u4EE3\u7801\uFF0C\u8BF7\u5F7B\u5E95\u9000\u51FA\u540E\u91CD\u65B0\u6253\u5F00\u3002`,
      cls: "wbav-hint"
    });
    new import_obsidian.Setting(containerEl).setName("\u7ACB\u5373\u540C\u6B65").setDesc("\u624B\u52A8\u89E6\u53D1\u4E00\u6B21\u53CC\u5411\u540C\u6B65\u3002\u9996\u6B21\u4F1A\u5F39\u7A97\u8981\u6C42\u8F93\u5165 WebDAV \u5BC6\u7801\uFF1B\u53EF\u53CD\u590D\u70B9\u51FB\u3002").addButton((button) => {
      this.plugin.activeSyncButton = button.buttonEl;
      button.setButtonText("\u7ACB\u5373\u540C\u6B65").setCta().onClick(async () => {
        if (button.disabled) return;
        button.setDisabled(true);
        button.setButtonText("\u540C\u6B65\u4E2D\u2026");
        try {
          await this.plugin.syncNow();
        } catch (e) {
          if (!import_obsidian.Platform.isMobile) {
            new import_obsidian.Notice("\u274C \u540C\u6B65\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)));
          }
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u7ACB\u5373\u540C\u6B65");
        }
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u670D\u52A1\u5668\u5730\u5740").setDesc(
      "WebDAV \u6839\u5730\u5740\uFF0C\u9700\u4EE5 / \u7ED3\u5C3E\u3002\u4F8B\u5982 https://sync.example.com:8080/\uFF08\u4E0D\u5199 http(s):// \u65F6\u9ED8\u8BA4\u6309 http:// \u5904\u7406\uFF09"
    ).addText(
      (text) => text.setPlaceholder("https://sync.example.com:8080/").setValue(this.plugin.settings.serverUrl).onChange(async (value) => {
        this.plugin.settings.serverUrl = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u7528\u6237\u540D").setDesc("WebDAV \u8D26\u53F7\uFF08\u670D\u52A1\u7AEF htpasswd \u4E2D\u914D\u7F6E\uFF09").addText(
      (text) => text.setPlaceholder("obsidian").setValue(this.plugin.settings.username).onChange(async (value) => {
        this.plugin.settings.username = value.trim();
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5BC6\u7801").setDesc(
      "WebDAV \u5BC6\u7801\u3002\u9ED8\u8BA4\u4E0D\u5199\u5165\u78C1\u76D8\uFF0C\u4EC5\u5728\u672C\u6B21\u8FD0\u884C\u5185\u5B58\u4E2D\u4FDD\u5B58\uFF0C\u91CD\u542F Obsidian \u540E\u9996\u6B21\u540C\u6B65\u4F1A\u8981\u6C42\u91CD\u65B0\u8F93\u5165\uFF1B\u5982\u9700\u514D\u53BB\u91CD\u8F93\uFF0C\u8BF7\u6253\u5F00\u4E0B\u9762\u7684\u300C\u8BB0\u4F4F\u5BC6\u7801\u300D\uFF08\u5C06\u4EE5\u660E\u6587\u5B58\u4E8E\u672C\u5730\uFF09\u3002"
    ).addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022").setValue(this.plugin.settings.password).onChange(async (value) => {
        this.plugin.settings.password = value;
        this.plugin.passwordCache = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("\u8BB0\u4F4F\u5BC6\u7801").setDesc(
      "\u5F00\u542F\u540E\uFF0C\u5BC6\u7801\u4F1A\u4EE5\u660E\u6587\u4FDD\u5B58\u5728\u672C\u5730 vault\uFF08data.json\uFF09\uFF0C\u91CD\u542F\u540E\u65E0\u9700\u91CD\u8F93\uFF1B\u4EC5\u5728\u670D\u52A1\u7AEF\u5DF2\u542F\u7528 HTTPS \u65F6\u5EFA\u8BAE\u5F00\u542F\u3002\u5173\u95ED\u5219\u5BC6\u7801\u7EDD\u4E0D\u843D\u76D8\uFF0C\u6700\u5B89\u5168\u3002"
    ).addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.rememberPassword).onChange(async (value) => {
        this.plugin.settings.rememberPassword = value;
        if (!value) {
          this.plugin.settings.password = "";
        }
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u8FDE\u63A5\u6D4B\u8BD5").setDesc("\u9A8C\u8BC1\u670D\u52A1\u5668\u5730\u5740\u4E0E\u8D26\u53F7\u5BC6\u7801\u662F\u5426\u53EF\u7528").addButton(
      (button) => button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5").onClick(async () => {
        button.setDisabled(true);
        button.setButtonText("\u6D4B\u8BD5\u4E2D\u2026");
        try {
          await this.plugin.engine.testConnection();
          new import_obsidian.Notice("\u2705 \u8FDE\u63A5\u6210\u529F\uFF0CWebDAV \u670D\u52A1\u53EF\u7528");
        } catch (e) {
          new import_obsidian.Notice(
            "\u274C \u8FDE\u63A5\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e))
          );
        } finally {
          button.setDisabled(false);
          button.setButtonText("\u6D4B\u8BD5\u8FDE\u63A5");
        }
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5B9A\u65F6\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09").setDesc("\u6BCF\u9694\u591A\u5C11\u5206\u949F\u81EA\u52A8\u540C\u6B65\u4E00\u6B21\uFF0C0 \u8868\u793A\u5173\u95ED\u5B9A\u65F6\u540C\u6B65").addText(
      (text) => text.setPlaceholder("15").setValue(String(this.plugin.settings.syncInterval)).onChange(async (value) => {
        const n = parseInt(value, 10);
        this.plugin.settings.syncInterval = isNaN(n) ? 0 : Math.max(0, n);
        await this.plugin.saveSettings();
        this.plugin.restartInterval();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5B9E\u65F6\u540C\u6B65").setDesc("\u5F00\u542F\u540E\uFF0C\u672C\u5730\u6587\u4EF6\u521B\u5EFA/\u4FEE\u6539/\u5220\u9664/\u91CD\u547D\u540D\u5C06\u81EA\u52A8\u89E6\u53D1\u540C\u6B65").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.enableRealtime).onChange(async (value) => {
        this.plugin.settings.enableRealtime = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u4EC5 WiFi \u540C\u6B65\uFF08\u79FB\u52A8\u7AEF\uFF09").setDesc("\u79FB\u52A8\u7AEF\u4EC5\u5728 WiFi / \u6709\u7EBF\u7F51\u7EDC\u4E0B\u540C\u6B65\uFF0C\u907F\u514D\u6D88\u8017\u624B\u673A\u6D41\u91CF\uFF08\u684C\u9762\u7AEF\u65E0\u6548\uFF09").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.wifiOnly).onChange(async (value) => {
        this.plugin.settings.wifiOnly = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u72B6\u6001\u680F\u663E\u793A").setDesc("\u5728 Obsidian \u5E95\u90E8\u72B6\u6001\u680F\u663E\u793A\u540C\u6B65\u72B6\u6001\u56FE\u6807").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.statusBarEnabled).onChange(async (value) => {
        this.plugin.settings.statusBarEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.refreshStatusBarVisibility();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5DE6\u4FA7\u8FB9\u680F\u540C\u6B65\u6309\u94AE").setDesc("\u5728 Obsidian \u5DE6\u4FA7\u8FB9\u680F\uFF08\u529F\u80FD\u533A\uFF09\u663E\u793A\u4E00\u4E2A\u540C\u6B65\u56FE\u6807\uFF0C\u70B9\u51FB\u5373\u53EF\u7ACB\u5373\u540C\u6B65").addToggle(
      (toggle) => toggle.setValue(this.plugin.settings.ribbonEnabled).onChange(async (value) => {
        this.plugin.settings.ribbonEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.refreshRibbonVisibility();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u51B2\u7A81\u5904\u7406\u7B56\u7565").setDesc(
      "\u5F53\u540C\u4E00\u6587\u4EF6\u5728\u4E24\u7AEF\u90FD\u88AB\u4FEE\u6539\u65F6\u5982\u4F55\u5904\u7406\uFF1A\u6700\u65B0\u4F18\u5148 / \u672C\u5730\u4F18\u5148 / \u8FDC\u7AEF\u4F18\u5148 / \u53CC\u7248\u672C\u4FDD\u7559"
    ).addDropdown(
      (dropdown) => dropdown.addOption("latest", "\u6700\u65B0\u4F18\u5148\uFF08\u6309\u4FEE\u6539\u65F6\u95F4\uFF09").addOption("local", "\u672C\u5730\u4F18\u5148").addOption("remote", "\u8FDC\u7AEF\u4F18\u5148").addOption("dual", "\u53CC\u7248\u672C\u4FDD\u7559").setValue(this.plugin.settings.conflictStrategy).onChange(async (value) => {
        this.plugin.settings.conflictStrategy = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("\u5FFD\u7565\u89C4\u5219").setDesc(
      "\u6BCF\u884C\u4E00\u6761 glob \u89C4\u5219\u3002\u9ED8\u8BA4\u5DF2\u5FFD\u7565 .obsidian/workspace.json\u3001.obsidian/workspace\u3001.trash\u3001.DS_Store\u3001*.tmp"
    ).addTextArea(
      (textarea) => textarea.setPlaceholder(".obsidian/workspace.json\n.tmp\n.secret/**").setValue(this.plugin.settings.ignoreRules).onChange(async (value) => {
        this.plugin.settings.ignoreRules = value;
        await this.plugin.saveSettings();
      })
    ).then((setting) => {
      setting.components.forEach((c) => {
        const el = c.inputEl;
        if (el) {
          el.rows = 6;
          el.style.width = "100%";
          el.style.fontFamily = "var(--font-monospace)";
        }
      });
    });
    containerEl.createEl("hr");
    containerEl.createEl("p", {
      text: "\u63D0\u793A\uFF1A\u9996\u6B21\u4F7F\u7528\u5EFA\u8BAE\u5148\u5728\u300C\u8FDE\u63A5\u6D4B\u8BD5\u300D\u901A\u8FC7\u540E\uFF0C\u518D\u624B\u52A8\u70B9\u4E00\u6B21\u300C\u7ACB\u5373\u540C\u6B65\u300D\u547D\u4EE4\u5B8C\u6210\u5168\u91CF\u540C\u6B65\u3002",
      cls: "wbav-hint"
    });
  }
};

// syncEngine.ts
var import_obsidian2 = require("obsidian");
var META_INDEX_PATH = "_obsidian_webdav_sync_index.json";
var META_DIR_PREFIX = "_obsidian_webdav_sync";
function b64encode(input) {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
async function sha256(buffer) {
  const subtle = globalThis.crypto?.subtle || window.crypto?.subtle;
  const digest = await subtle.digest("SHA-256", buffer);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}
function encodePath(relPath) {
  return relPath.split("/").map((seg) => seg === "" ? "" : encodeURIComponent(seg)).join("/");
}
function globToRegExp(glob) {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i += 2;
        if (glob[i] === "/") i++;
      } else {
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
      i++;
    } else {
      re += c;
      i++;
    }
  }
  return new RegExp("^" + re + "$");
}
function matchGlob(pattern, path) {
  let p = pattern.trim();
  if (!p) return false;
  if (p.endsWith("/")) p = p.slice(0, -1);
  const regexes = [
    globToRegExp(p),
    globToRegExp(p + "/**"),
    globToRegExp(p + "/*")
  ];
  return regexes.some((r) => r.test(path));
}
async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (i < items.length) {
        const cur = items[i++];
        await fn(cur);
      }
    }
  );
  await Promise.all(workers);
}
function describeNetworkError(e) {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/net::[A-Z_]+/i);
  const code = m ? m[0].toUpperCase() : "";
  const suffix = code ? `\uFF08${code}\uFF09` : "";
  if (/cleartext/i.test(raw)) {
    return `\u7CFB\u7EDF\u62E6\u622A\u4E86\u660E\u6587 HTTP \u8BF7\u6C42${suffix}\uFF1A\u5F53\u524D\u7528\u7684\u662F http:// \u5730\u5740\uFF0C\u800C\u624B\u673A\u7CFB\u7EDF\u9ED8\u8BA4\u7981\u6B62\u660E\u6587\u4F20\u8F93\u3002
\u53EF\u9009\u505A\u6CD5\uFF1A
\u2460 \u786E\u8BA4\u670D\u52A1\u7AEF\u786E\u5B9E\u5F00\u4E86\u660E\u6587\u7AEF\u53E3\uFF0C\u4E14\u7AEF\u53E3\u53F7\u6CA1\u5199\u9519\uFF08\u672C\u65B9\u6848\uFF1A8080 \u662F HTTPS\uFF0C8081 \u662F\u660E\u6587 HTTP\uFF09\uFF1B
\u2461 \u82E5\u5FC5\u987B\u8D70 https\uFF0C\u8BF7\u8BA9\u670D\u52A1\u5668\u6362\u6210**\u53D7\u4FE1\u4EFB\u8BC1\u4E66**\uFF08\u5982 Let's Encrypt\uFF09\uFF0C\u624B\u673A\u65E0\u9700\u5B89\u88C5\u4EFB\u4F55\u8BC1\u4E66\u5373\u53EF\u76F4\u8FDE\uFF1B
\u2462 \u81EA\u7B7E\u540D\u8BC1\u4E66\u65E0\u6CD5\u7ED5\u8FC7\u8FD9\u6761\u9650\u5236\u2014\u2014\u5373\u4F7F\u624B\u673A\u4E0A\u88C5\u4E86\u8BC1\u4E66\uFF0C\u5B89\u5353 App \u9ED8\u8BA4\u4E5F\u4E0D\u4F1A\u91C7\u7528\u3002`;
  }
  if (/CertPathValidatorException|Trust anchor for certification path not found|SSLHandshakeException/i.test(raw)) {
    return `\u670D\u52A1\u5668\u8BC1\u4E66\u4E0D\u88AB\u672C\u673A\u4FE1\u4EFB${suffix}\u3002\u26A0\uFE0F \u8FD9\u662F\u5B89\u5353\u7AEF\u7684\u5178\u578B\u8868\u73B0\uFF1AAndroid 7+ \u7684 App \u9ED8\u8BA4\u53EA\u4FE1\u4EFB\u300C\u7CFB\u7EDF\u5185\u7F6E CA\u300D\uFF0C\u4F60\u624B\u52A8\u5B89\u88C5\u7684\u8BC1\u4E66\u5BF9\u5B83\u4E0D\u8D77\u4F5C\u7528\u3002
\u89E3\u51B3\u529E\u6CD5\uFF1A
\u2460 \u624B\u673A\u7AEF\u6539\u586B\u670D\u52A1\u7AEF\u7684**\u660E\u6587\u7AEF\u53E3**\uFF08\u672C\u65B9\u6848\u4E3A http://\u670D\u52A1\u5668IP:8081/\uFF09\uFF0C\u63D2\u4EF6\u4F1A\u4EE5\u660E\u6587\u65B9\u5F0F\u540C\u6B65\uFF1B
\u2461 \u6216\u628A\u670D\u52A1\u5668\u8BC1\u4E66\u6362\u6210\u53D7\u4FE1\u4EFB\u7684\u6B63\u5F0F\u8BC1\u4E66\uFF08Let's Encrypt\uFF09\uFF0C\u5730\u5740\u518D\u6362\u56DE https://\u670D\u52A1\u5668IP:8080/\uFF08\u63A8\u8350\uFF0C\u4E00\u52B3\u6C38\u9038\uFF09\u3002`;
  }
  switch (code) {
    case "NET::ERR_EMPTY_RESPONSE":
      return `\u670D\u52A1\u7AEF\u5EFA\u7ACB\u4E86 TCP \u8FDE\u63A5\u4F46\u6CA1\u6709\u8FD4\u56DE\u4EFB\u4F55 HTTP \u6570\u636E${suffix}\u3002\u5E38\u89C1\u539F\u56E0\uFF1A
\u2460 \u534F\u8BAE\u4E0D\u5339\u914D\u2014\u2014\u670D\u52A1\u7AEF\u662F HTTPS \u5374\u7528 http:// \u8BBF\u95EE\uFF0C\u6216\u53CD\u4E4B\uFF1B
\u2461 \u7535\u8111\u4E0A\u7684\u7CFB\u7EDF\u4EE3\u7406/VPN\uFF08\u5982 Clash\u3001V2Ray\u3001\u516C\u53F8\u4EE3\u7406\uFF09\u62E6\u622A\u4E86\u8BE5\u8BF7\u6C42\uFF0C\u8BF7\u5173\u95ED\u4EE3\u7406\u540E\u91CD\u8BD5\uFF1B
\u2462 8080 \u7AEF\u53E3\u88AB\u522B\u7684\u7A0B\u5E8F\u5360\u7528\uFF0C\u6216\u5BB9\u5668\u6CA1\u771F\u6B63\u8DD1\u8D77\u6765\uFF08\u5728\u670D\u52A1\u5668\u4E0A\u6267\u884C docker ps / docker logs obsidian-webdav \u67E5\u770B\uFF09\u3002`;
    case "NET::ERR_CONNECTION_REFUSED":
      return `\u76EE\u6807\u7AEF\u53E3\u62D2\u7EDD\u8FDE\u63A5${suffix}\u3002\u8BF4\u660E\u670D\u52A1\u5668\u4E0A 8080 \u7AEF\u53E3\u6CA1\u6709\u7A0B\u5E8F\u5728\u76D1\u542C\uFF1A\u68C0\u67E5\u5BB9\u5668\u662F\u5426 Up\uFF08docker ps\uFF09\u3001\u7AEF\u53E3\u6620\u5C04\u662F\u5426\u4E3A 8080:8080\u3002`;
    case "NET::ERR_CONNECTION_TIMED_OUT":
    case "NET::ERR_TIMED_OUT":
      return `\u8FDE\u63A5\u8D85\u65F6${suffix}\u3002\u901A\u5E38\u662F\u9632\u706B\u5899/\u4E91\u5B89\u5168\u7EC4\u6CA1\u6709\u653E\u884C 8080 \u7AEF\u53E3\uFF0C\u6216\u670D\u52A1\u5668 IP/\u7AEF\u53E3\u586B\u9519\u3002`;
    case "NET::ERR_NAME_NOT_RESOLVED":
      return `\u57DF\u540D\u65E0\u6CD5\u89E3\u6790${suffix}\u3002\u8BF7\u68C0\u67E5\u670D\u52A1\u5668\u5730\u5740\u62FC\u5199\uFF0C\u6216\u6539\u7528 IP \u76F4\u8FDE\u3002`;
    case "NET::ERR_SSL_PROTOCOL_ERROR":
      return `HTTPS \u63E1\u624B\u5931\u8D25${suffix}\u3002\u82E5\u670D\u52A1\u7AEF\u5DF2\u542F\u7528 HTTPS\uFF0C\u8BF7\u786E\u8BA4\u5730\u5740\u7528\u7684\u662F https://\uFF1B\u53CD\u4E4B\u82E5\u670D\u52A1\u7AEF\u662F HTTP\uFF0C\u8BF7\u6539\u7528 http://\u3002`;
    case "NET::ERR_CERT_AUTHORITY_INVALID":
    case "NET::ERR_CERT_COMMON_NAME_INVALID":
    case "NET::ERR_CERT_DATE_INVALID":
      return `\u670D\u52A1\u5668\u8BC1\u4E66\u4E0D\u88AB\u4FE1\u4EFB${suffix}\u3002\u82E5\u670D\u52A1\u7AEF\u7528\u7684\u662F\u81EA\u7B7E\u540D\u8BC1\u4E66\uFF08\u672C\u65B9\u6848\u9ED8\u8BA4\uFF09\uFF0C\u9700\u8981\u5728\u8BBE\u5907\u4E0A\u4FE1\u4EFB\u8BE5\u8BC1\u4E66\u540E\u91CD\u8BD5\uFF1A
\u2460 \u7535\u8111\u7AEF\uFF1A\u6D4F\u89C8\u5668\u8BBF\u95EE\u4E00\u6B21 https://\u670D\u52A1\u5668\u5730\u5740:\u7AEF\u53E3/ \uFF0C\u6309\u63D0\u793A\u300C\u7EE7\u7EED\u8BBF\u95EE\u300D\u5E76\u628A\u8BC1\u4E66\u52A0\u5165\u7CFB\u7EDF\u4FE1\u4EFB\uFF1B
\u2461 \u624B\u673A\u7AEF\uFF1A\u5B89\u88C5\u5E76\u4FE1\u4EFB\u8BE5\u8BC1\u4E66\uFF08Android \u9700\u5728\u300C\u5B89\u5168-\u52A0\u5BC6\u4E0E\u51ED\u636E-\u5B89\u88C5\u8BC1\u4E66\u300D\u4E2D\u5BFC\u5165\uFF09\uFF1B
\u2462 \u8FFD\u6C42\u96F6\u5F39\u7A97\uFF1A\u6539\u7528\u53D7\u4FE1\u4EFB\u8BC1\u4E66\uFF08\u5982 Let's Encrypt\uFF09\uFF0C\u66FF\u6362\u670D\u52A1\u5668 ./ssl \u76EE\u5F55\u540E\u91CD\u542F\u5BB9\u5668\u3002
\u4E34\u65F6\u6392\u67E5\u53EF\u5148\u6539\u7528 http:// \u76F4\u8FDE\uFF08\u5BC6\u7801\u5C06\u660E\u6587\u4F20\u8F93\uFF0C\u4E0D\u63A8\u8350\u957F\u671F\u4F7F\u7528\uFF09\u3002`;
    case "NET::ERR_CONNECTION_RESET":
    case "NET::ERR_CONNECTION_CLOSED":
      return `\u8FDE\u63A5\u88AB\u5BF9\u7AEF\u91CD\u7F6E${suffix}\u3002\u591A\u4E3A\u4E2D\u95F4\u8BBE\u5907\uFF08\u4EE3\u7406/\u9632\u706B\u5899\uFF09\u62E6\u622A\uFF0C\u6216\u670D\u52A1\u7AEF\u8FDB\u7A0B\u5F02\u5E38\u9000\u51FA\u3002`;
    default:
      return raw;
  }
}
var WebDavClient = class {
  constructor(serverUrl, username, password) {
    this.createdDirs = /* @__PURE__ */ new Set();
    let base = serverUrl.trim();
    if (base && !/^https?:\/\//i.test(base)) {
      base = "http://" + base;
    }
    if (!base.endsWith("/")) base += "/";
    this.base = base;
    this.authHeader = "Basic " + b64encode(`${username}:${password}`);
  }
  buildUrl(relPath) {
    if (!relPath || relPath === "/") return this.base;
    return this.base + encodePath(relPath);
  }
  authHeaders(extra) {
    return { Authorization: this.authHeader, ...extra };
  }
  /** 将 WebDAV 返回的 href 转换为相对于根的路径 */
  hrefToPath(href) {
    let p;
    if (/^https?:\/\//i.test(href)) {
      try {
        p = new URL(href).pathname;
      } catch {
        p = href;
      }
    } else {
      p = href;
    }
    try {
      const basePath = new URL(this.base).pathname;
      if (basePath !== "/" && basePath.length > 1 && p.startsWith(basePath)) {
        p = p.slice(basePath.length);
      }
    } catch {
    }
    p = decodeURIComponent(p);
    if (p.startsWith("/")) p = p.slice(1);
    if (p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }
  /**
   * PROPFIND 列出某目录及其子目录（递归，Depth=1 逐层展开，兼容性最好）
   * 返回该目录树下所有条目的信息（含目录本身，调用方需自行过滤）。
   */
  async propfind(relPath, depth = "1") {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:"><prop>
<getlastmodified/>
<getcontentlength/>
<resourcetype/>
</prop></propfind>`;
    const param = {
      url: this.buildUrl(relPath),
      method: "PROPFIND",
      headers: this.authHeaders({
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8"
      }),
      body
    };
    const res = await (0, import_obsidian2.requestUrl)(param);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`PROPFIND \u5931\u8D25\uFF0CHTTP ${res.status}`);
    }
    return this.parsePropfind(res.text);
  }
  /** 递归列举整棵目录树（并行展开各子目录，避免逐层串行） */
  async listRecursive(relPath) {
    const top = await this.propfind(relPath, "1");
    const out = [];
    const dirs = [];
    for (const item of top) {
      if (item.path === relPath) continue;
      if (item.path.startsWith(META_DIR_PREFIX)) continue;
      out.push(item);
      if (item.isDir) dirs.push(item.path);
    }
    if (dirs.length) {
      const subLists = await Promise.all(
        dirs.map((d) => this.listRecursive(d))
      );
      for (const sub of subLists) out.push(...sub);
    }
    return out;
  }
  /**
   * 用一次 Depth:infinity 的 PROPFIND 拉取整棵树（最大提速点）；
   * 若服务端不支持 infinity（返回非 2xx），回退到逐目录并行递归。
   */
  async listAll(relPath) {
    try {
      return await this.propfind(relPath, "infinity");
    } catch {
      return await this.listRecursive(relPath);
    }
  }
  parsePropfind(xml) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const responses = this.collectByLocalName(doc, "response");
    const result = [];
    for (const resp of responses) {
      const href = this.findChildText(resp, "href");
      if (!href) continue;
      const path = this.hrefToPath(href);
      let isDir = false;
      let mtime = 0;
      let size = 0;
      const propstats = this.collectByLocalName(resp, "propstat");
      const propEls = propstats.length ? propstats.map((ps) => this.findChild(ps, "prop")).filter(Boolean) : [resp];
      for (const prop of propEls) {
        if (this.findChild(prop, "collection")) {
          isDir = true;
        } else {
          const rt = this.findChild(prop, "resourcetype");
          if (rt && this.findChild(rt, "collection")) isDir = true;
        }
        const lm = this.findChildText(prop, "getlastmodified");
        if (lm) {
          const t = Date.parse(lm);
          if (!isNaN(t)) mtime = t;
        }
        const cl = this.findChildText(prop, "getcontentlength");
        if (cl) size = parseInt(cl, 10) || 0;
      }
      result.push({ path, isDir, mtime, size });
    }
    return result;
  }
  /** 在 parent 下查找 localName 匹配的第一个子元素（忽略命名空间前缀） */
  findChild(parent, localName) {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 1) {
        const el = child;
        if (el.localName === localName) return el;
      }
    }
    return null;
  }
  findChildText(parent, localName) {
    const el = this.findChild(parent, localName);
    return el && el.textContent ? el.textContent.trim() : null;
  }
  /**
   * 递归收集所有 localName 匹配的后代元素（忽略命名空间前缀）。
   * 等价于 getElementsByTagNameNS("*", localName)，但不依赖浏览器对命名空间的
   * 匹配差异，行为最稳定。专门用于替代 getElementsByTagName，
   * 后者在 XML 文档里按「限定名」匹配，遇到 <D:response> 这类带前缀的元素会失效。
   */
  collectByLocalName(root, localName) {
    const out = [];
    const walk = (node) => {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === 1) {
          const el = child;
          if (el.localName === localName) out.push(el);
          walk(el);
        }
      }
    };
    walk(root);
    return out;
  }
  /**
   * 轻量探测：HEAD 请求，只取响应头（ETag / Last-Modified），不下载内容。
   * 用于判断「服务器上的某个文件有没有变」，开销极小（几十字节）。
   * 失败或文件不存在时返回 null。
   */
  async head(relPath) {
    try {
      const res = await (0, import_obsidian2.requestUrl)({
        url: this.buildUrl(relPath),
        method: "HEAD",
        headers: this.authHeaders(),
        throw: false
      });
      if (res.status < 200 || res.status >= 300) return null;
      const h = res.headers || {};
      return {
        etag: h["etag"] || h["ETag"] || null,
        lastModified: h["last-modified"] || h["Last-Modified"] || null
      };
    } catch {
      return null;
    }
  }
  /** GET 下载文件内容为 ArrayBuffer */
  async get(relPath) {
    const res = await (0, import_obsidian2.requestUrl)({
      url: this.buildUrl(relPath),
      method: "GET",
      headers: this.authHeaders()
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`\u4E0B\u8F7D\u5931\u8D25 ${relPath}\uFF0CHTTP ${res.status}`);
    return res.arrayBuffer;
  }
  /** HEAD 风格的可用性探测（实际用 PROPFIND 根目录） */
  async testConnection() {
    if (!this.base || this.base === "/") {
      throw new Error("\u8BF7\u5148\u586B\u5199\u670D\u52A1\u5668\u5730\u5740\uFF0C\u4F8B\u5982 http://1.2.3.4:8080/");
    }
    let res;
    try {
      res = await (0, import_obsidian2.requestUrl)({
        url: this.base,
        method: "PROPFIND",
        headers: this.authHeaders({
          Depth: "0",
          "Content-Type": "application/xml; charset=utf-8"
        }),
        body: `<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>`
      });
    } catch (e) {
      throw new Error(describeNetworkError(e));
    }
    if (res.status < 200 || res.status >= 300)
      throw new Error(`\u8FDE\u63A5\u6D4B\u8BD5\u5931\u8D25\uFF0CHTTP ${res.status}`);
  }
  /** PUT 上传文件（自动创建父目录） */
  async put(relPath, data) {
    await this.ensureParentDir(relPath);
    const res = await (0, import_obsidian2.requestUrl)({
      url: this.buildUrl(relPath),
      method: "PUT",
      headers: this.authHeaders({
        "Content-Type": "application/octet-stream"
      }),
      body: data
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`\u4E0A\u4F20\u5931\u8D25 ${relPath}\uFF0CHTTP ${res.status}`);
  }
  /** DELETE 删除文件/目录 */
  async delete(relPath) {
    const res = await (0, import_obsidian2.requestUrl)({
      url: this.buildUrl(relPath),
      method: "DELETE",
      headers: this.authHeaders()
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`\u5220\u9664\u5931\u8D25 ${relPath}\uFF0CHTTP ${res.status}`);
  }
  /** MKCOL 创建目录（已存在则忽略） */
  async mkcol(relPath) {
    try {
      await (0, import_obsidian2.requestUrl)({
        url: this.buildUrl(relPath),
        method: "MKCOL",
        headers: this.authHeaders()
      });
    } catch {
    }
  }
  /** 确保某文件路径的父目录存在（用 Set 缓存，避免对同目录重复 MKCOL） */
  async ensureParentDir(relPath) {
    const parts = relPath.split("/").slice(0, -1);
    let cur = "";
    for (const part of parts) {
      cur = cur ? cur + "/" + part : part;
      if (this.createdDirs.has(cur)) continue;
      await this.mkcol(cur);
      this.createdDirs.add(cur);
    }
  }
};
var SyncEngine = class {
  constructor(plugin) {
    this.client = null;
    /** 进度回调（由插件注入，用于刷新状态栏） */
    this.onProgress = null;
    this.plugin = plugin;
  }
  get app() {
    return this.plugin.app;
  }
  /** 用给定的密码构建 WebDAV 客户端 */
  createClient(password) {
    const s = this.plugin.settings;
    return new WebDavClient(s.serverUrl, s.username, password);
  }
  /** 连接测试 */
  async testConnection() {
    const password = await this.plugin.getPassword();
    const client = this.createClient(password);
    await client.testConnection();
  }
  /** 判断是否需要忽略该路径（默认规则 + 用户自定义规则） */
  isIgnored(path) {
    if (path.startsWith(META_DIR_PREFIX)) return true;
    const rules = this.plugin.settings.ignoreRules.split("\n").map((r) => r.trim()).filter((r) => r.length > 0);
    return rules.some((rule) => matchGlob(rule, path));
  }
  /** 移动端仅在 WiFi/有线网络下才允许同步（最佳努力判断） */
  allowByNetwork() {
    const s = this.plugin.settings;
    if (!s.wifiOnly) return true;
    if (!import_obsidian2.Platform.isMobile) return true;
    const conn = navigator.connection;
    if (!conn || !conn.type) return true;
    return conn.type === "wifi" || conn.type === "ethernet";
  }
  /** 获取本地文件清单（含哈希，已变更才重算哈希，实现增量） */
  async getLocalFiles() {
    const files = this.app.vault.getFiles();
    const index = this.plugin.index.files;
    const out = [];
    for (const f of files) {
      if (this.isIgnored(f.path)) continue;
      const prev = index[f.path];
      let hash = "";
      const unchanged = prev && prev.mtime === f.stat.mtime && prev.size === f.stat.size;
      if (unchanged) {
        hash = prev.hash;
      } else {
        const buf = await this.app.vault.adapter.readBinary(f.path);
        hash = await sha256(buf);
      }
      out.push({ path: f.path, mtime: f.stat.mtime, size: f.stat.size, hash });
    }
    return out;
  }
  /** 从远端读取元数据索引（不存在则返回空索引） */
  async loadRemoteIndex() {
    const client = this.client;
    try {
      const buf = await client.get(META_INDEX_PATH);
      const text = new TextDecoder().decode(buf);
      const parsed = JSON.parse(text);
      if (parsed && parsed.files) return parsed;
    } catch {
    }
    return { version: 1, lastSyncTime: 0, files: {} };
  }
  /** 上传远端元数据索引 */
  async saveRemoteIndex(index) {
    const client = this.client;
    const buf = new TextEncoder().encode(JSON.stringify(index)).buffer;
    await client.put(META_INDEX_PATH, buf);
  }
  /** 确保本地父目录存在 */
  async ensureLocalParent(relPath) {
    const dir = relPath.split("/").slice(0, -1).join("/");
    if (dir && !await this.app.vault.adapter.exists(dir)) {
      await this.app.vault.adapter.mkdir(dir);
    }
  }
  /** 写文件到本地（新建或覆盖） */
  async writeLocal(relPath, data) {
    await this.ensureLocalParent(relPath);
    await this.app.vault.adapter.writeBinary(relPath, data);
  }
  /**
   * 删除本地文件：优先走 Obsidian 回收站（可恢复），失败才退回硬删除。
   * 之前直接调用 adapter.remove() 是永久删除、不进回收站，一旦误判就无法挽回。
   */
  async trashLocal(relPath) {
    const f = this.app.vault.getAbstractFileByPath(relPath);
    const fm = this.app.fileManager;
    if (f && fm) {
      try {
        if (typeof fm.trashFile === "function") {
          await fm.trashFile(f);
          return;
        }
        if (typeof fm.trash === "function") {
          await fm.trash(f);
          return;
        }
      } catch {
      }
    }
    await this.app.vault.adapter.remove(relPath);
  }
  /** 生成「双版本保留」时的远端副本文件名，例如 note (remote 2026-09-17 1130).md */
  remoteCopyName(path) {
    const dot = path.lastIndexOf(".");
    const ext = dot > 0 ? path.slice(dot) : "";
    const base = dot > 0 ? path.slice(0, dot) : path;
    const d = /* @__PURE__ */ new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )} ${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `${base} (remote ${stamp})${ext}`;
  }
  /** 主同步流程 */
  async sync() {
    if (!this.plugin.settings.serverUrl) {
      this.report("error", "\u672A\u914D\u7F6E\u670D\u52A1\u5668\u5730\u5740", 0, 0, 0, 0, 0, 0);
      throw new Error("\u672A\u914D\u7F6E\u670D\u52A1\u5668\u5730\u5740");
    }
    if (!this.allowByNetwork()) {
      this.report("offline", "\u5DF2\u8BBE\u4E3A\u4EC5 WiFi \u540C\u6B65\uFF0C\u5F53\u524D\u975E WiFi \u73AF\u5883", 0, 0, 0, 0, 0, 0);
      return;
    }
    this.plugin.syncing = true;
    this.report("syncing", "\u6B63\u5728\u51C6\u5907\u540C\u6B65\u2026", 0, 0, 0, 0, 0, 0);
    const password = await this.plugin.getPassword();
    if (!password) {
      this.report("error", "\u672A\u63D0\u4F9B\u5BC6\u7801\uFF0C\u5DF2\u53D6\u6D88\u540C\u6B65", 0, 0, 0, 0, 0, 0);
      this.plugin.syncing = false;
      throw new Error("\u672A\u63D0\u4F9B\u5BC6\u7801\uFF0C\u5DF2\u53D6\u6D88\u540C\u6B65");
    }
    const client = this.client = this.createClient(password);
    try {
      const localFiles = await this.getLocalFiles();
      const localMap = new Map(localFiles.map((f) => [f.path, f]));
      const remoteListing = await client.listAll("");
      const remoteMap = new Map(
        remoteListing.filter((r) => !r.isDir && r.path !== META_INDEX_PATH).map((r) => [r.path, r])
      );
      const remoteDirSet = new Set(
        remoteListing.filter((r) => r.isDir).map((r) => r.path)
      );
      const localIndexMap = this.plugin.index.files;
      let remoteTag = null;
      try {
        const h = await client.head(META_INDEX_PATH);
        remoteTag = h ? h.etag || h.lastModified || null : null;
      } catch {
        remoteTag = null;
      }
      const localChanged = localFiles.length !== Object.keys(localIndexMap).length || localFiles.some((f) => {
        const prev = localIndexMap[f.path];
        return !prev || prev.mtime !== f.mtime || prev.size !== f.size;
      });
      const remoteUnchanged = !!remoteTag && remoteTag === this.plugin.index.remoteIndexTag;
      if (remoteUnchanged && !localChanged) {
        this.plugin.index.lastSyncTime = Date.now();
        await this.plugin.saveSettings();
        this.report(
          "success",
          "\u540C\u6B65\u5B8C\u6210 \u2713\uFF08\u4E24\u7AEF\u5747\u65E0\u53D8\u5316\uFF0C\u5DF2\u8DF3\u8FC7\u5168\u91CF\u626B\u63CF\uFF09",
          0,
          0,
          0,
          0,
          0,
          0
        );
        return;
      }
      const remoteIndex = await this.loadRemoteIndex();
      const remoteIndexMap = remoteIndex.files;
      const tombstones = remoteIndex.deleted = remoteIndex.deleted || {};
      const prevLocalIndex = { ...localIndexMap };
      const locallyDeleted = Object.keys(prevLocalIndex).filter(
        (p) => !this.isIgnored(p) && !localMap.has(p)
      );
      const locallyDeletedSet = new Set(locallyDeleted);
      const indexCount = Object.keys(prevLocalIndex).length;
      const delLimit = Math.max(50, Math.floor(indexCount * 0.95));
      const listingSuspect = localMap.size === 0 && indexCount > 0;
      const remoteDeleteAborted = listingSuspect || locallyDeleted.length > delLimit;
      if (remoteDeleteAborted) {
        console.warn(
          `[WebDAV Sync] \u5DF2\u8DF3\u8FC7\u5220\u9664\u4F20\u64AD\uFF1A\u672C\u5730\u5217\u8868\u4E3A\u7A7A=${listingSuspect}\uFF0C\u5F85\u5220\u8FDC\u7AEF=${locallyDeleted.length}\uFF0C\u4E0A\u9650=${delLimit}`
        );
      }
      let up = 0, down = 0, del = 0, conf = 0, err = 0;
      const allPaths = Array.from(
        /* @__PURE__ */ new Set([
          ...localMap.keys(),
          ...remoteMap.keys(),
          ...locallyDeleted
        ])
      ).filter((p) => !this.isIgnored(p));
      let done = 0;
      const total = allPaths.length;
      const processPath = async (path) => {
        const local = localMap.get(path);
        const remote = remoteMap.get(path);
        try {
          if (locallyDeletedSet.has(path)) {
            if (!remote) {
              delete localIndexMap[path];
              del++;
              return;
            }
            const lastAgreedHash = prevLocalIndex[path]?.hash;
            const nowRemoteHash = remoteIndexMap[path]?.hash;
            const canDeleteSafely = !!lastAgreedHash && !!nowRemoteHash && lastAgreedHash === nowRemoteHash;
            if (!canDeleteSafely) {
              const buf = await client.get(path);
              await this.writeLocal(path, buf);
              const lhash = await sha256(buf);
              const st = await this.app.vault.adapter.stat(path);
              localIndexMap[path] = {
                mtime: st ? st.mtime : remote.mtime,
                size: st ? st.size : remote.size,
                hash: lhash
              };
              delete tombstones[path];
              down++;
            } else if (remoteDeleteAborted) {
              console.warn(`[WebDAV Sync] \u5DF2\u8DF3\u8FC7\u5220\u9664\u8FDC\u7AEF ${path}\uFF08\u5220\u9664\u4FDD\u62A4\u751F\u6548\uFF09`);
            } else {
              await client.delete(path);
              tombstones[path] = { t: Date.now(), hash: nowRemoteHash };
              delete remoteIndexMap[path];
              delete localIndexMap[path];
              del++;
            }
            return;
          }
          if (local && !remote) {
            const tb = tombstones[path];
            if (tb) {
              const unchanged = tb.hash && local.hash === tb.hash || !tb.hash && local.mtime <= tb.t;
              if (unchanged) {
                await this.trashLocal(path);
                delete localIndexMap[path];
                del++;
                return;
              }
              delete tombstones[path];
            }
            const buf = await this.app.vault.adapter.readBinary(path);
            await client.put(path, buf);
            remoteIndexMap[path] = {
              mtime: local.mtime,
              size: local.size,
              hash: local.hash
            };
            up++;
          } else if (!local && remote) {
            delete tombstones[path];
            const buf = await client.get(path);
            await this.writeLocal(path, buf);
            const lhash = await sha256(buf);
            const st = await this.app.vault.adapter.stat(path);
            localIndexMap[path] = {
              // 用写入后的真实本地 mtime，避免下次同步重复重算哈希
              mtime: st ? st.mtime : remote.mtime,
              size: st ? st.size : remote.size,
              hash: lhash
            };
            down++;
          } else if (local && remote) {
            delete tombstones[path];
            const remoteState = remoteIndexMap[path];
            let remoteHash = remoteState ? remoteState.hash : "";
            if (!remoteHash) {
              const buf = await client.get(path);
              remoteHash = await sha256(buf);
              remoteIndexMap[path] = {
                mtime: remote.mtime,
                size: remote.size,
                hash: remoteHash
              };
            }
            if (local.hash === remoteHash) {
              return;
            }
            conf++;
            const strategy = this.plugin.settings.conflictStrategy;
            if (strategy === "local") {
              const buf = await this.app.vault.adapter.readBinary(path);
              await client.put(path, buf);
              remoteIndexMap[path] = {
                mtime: local.mtime,
                size: local.size,
                hash: local.hash
              };
            } else if (strategy === "remote") {
              const buf = await client.get(path);
              await this.writeLocal(path, buf);
              const lhash = await sha256(buf);
              const st = await this.app.vault.adapter.stat(path);
              localIndexMap[path] = {
                mtime: st ? st.mtime : remote.mtime,
                size: st ? st.size : remote.size,
                hash: lhash
              };
            } else if (strategy === "latest") {
              if (local.mtime >= remote.mtime) {
                const buf = await this.app.vault.adapter.readBinary(path);
                await client.put(path, buf);
                remoteIndexMap[path] = {
                  mtime: local.mtime,
                  size: local.size,
                  hash: local.hash
                };
              } else {
                const buf = await client.get(path);
                await this.writeLocal(path, buf);
                const lhash = await sha256(buf);
                localIndexMap[path] = {
                  mtime: remote.mtime,
                  size: remote.size,
                  hash: lhash
                };
              }
            } else {
              const buf = await client.get(path);
              const copyName = this.remoteCopyName(path);
              await this.writeLocal(copyName, buf);
              const cst = await this.app.vault.adapter.stat(copyName);
              const chash = await sha256(buf);
              localIndexMap[copyName] = {
                mtime: cst ? cst.mtime : remote.mtime,
                size: cst ? cst.size : remote.size,
                hash: chash
              };
              const lbuf = await this.app.vault.adapter.readBinary(path);
              await client.put(path, lbuf);
              remoteIndexMap[path] = {
                mtime: local.mtime,
                size: local.size,
                hash: local.hash
              };
            }
          }
        } catch (e) {
          err++;
          console.error(`[WebDAV Sync] \u5904\u7406 ${path} \u51FA\u9519:`, e);
        } finally {
          done++;
          if (done % 8 === 0 || done === total) {
            this.report(
              "syncing",
              `\u540C\u6B65\u4E2D\u2026 ${done}/${total}`,
              up,
              down,
              del,
              conf,
              err,
              total
            );
          }
        }
      };
      this.report(
        "syncing",
        `\u8FDC\u7AEF ${remoteMap.size} \u4E2A / \u672C\u5730 ${localMap.size} \u4E2A\uFF0C\u5F00\u59CB\u540C\u6B65\u2026`,
        0,
        0,
        0,
        0,
        0,
        total
      );
      const concurrency = import_obsidian2.Platform.isMobile ? 3 : 6;
      await mapLimit(allPaths, concurrency, processPath);
      const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1e3;
      const nowTs = Date.now();
      for (const p of Object.keys(tombstones)) {
        if (nowTs - (tombstones[p]?.t || 0) > TOMBSTONE_TTL_MS) {
          delete tombstones[p];
        }
      }
      remoteIndex.lastSyncTime = Date.now();
      this.plugin.index.lastSyncTime = remoteIndex.lastSyncTime;
      await this.saveRemoteIndex(remoteIndex);
      if (err === 0) {
        try {
          const h = await client.head(META_INDEX_PATH);
          this.plugin.index.remoteIndexTag = h && (h.etag || h.lastModified) || void 0;
        } catch {
          this.plugin.index.remoteIndexTag = void 0;
        }
      } else {
        this.plugin.index.remoteIndexTag = void 0;
      }
      await this.plugin.saveSettings();
      const msg = remoteDeleteAborted ? `\u540C\u6B65\u5B8C\u6210\uFF0C\u4F46\u5DF2\u8DF3\u8FC7\u5220\u9664\uFF08\u7591\u4F3C\u5F02\u5E38\uFF1A\u5F85\u5220 ${locallyDeleted.length}\uFF0C\u4E0A\u9650 ${delLimit}\uFF09\uFF0C\u8BF7\u68C0\u67E5\u540E\u91CD\u8BD5` : err > 0 ? `\u540C\u6B65\u5B8C\u6210\uFF08${err} \u4E2A\u9519\u8BEF\uFF09` : `\u540C\u6B65\u5B8C\u6210 \u2713 \u4E0A\u4F20${up} \u4E0B\u8F7D${down} \u5220\u9664${del} \u51B2\u7A81${conf}`;
      this.report("success", msg, up, down, del, conf, err, total);
    } catch (e) {
      console.error("[WebDAV Sync] \u540C\u6B65\u5931\u8D25:", e);
      this.report(
        "error",
        "\u540C\u6B65\u5931\u8D25\uFF1A" + (e instanceof Error ? e.message : String(e)),
        0,
        0,
        0,
        0,
        1,
        0
      );
      throw e;
    } finally {
      this.plugin.syncing = false;
    }
  }
  /** 上报进度 */
  report(status, message, uploaded, downloaded, deleted, conflicts, errors, total) {
    if (this.onProgress) {
      const p = {
        status,
        message,
        uploaded,
        downloaded,
        deleted,
        conflicts,
        errors,
        total
      };
      this.onProgress(p);
    }
  }
};

// types.ts
var DEFAULT_SETTINGS = {
  serverUrl: "",
  username: "",
  password: "",
  rememberPassword: false,
  syncInterval: 15,
  enableRealtime: true,
  wifiOnly: false,
  ignoreRules: [
    ".obsidian/workspace.json",
    ".obsidian/workspace",
    ".trash",
    ".DS_Store",
    "*.tmp"
  ].join("\n"),
  conflictStrategy: "latest",
  statusBarEnabled: true,
  ribbonEnabled: true
};

// main.ts
var WebDavSyncPlugin = class extends import_obsidian3.Plugin {
  constructor() {
    super(...arguments);
    this.statusBarItem = null;
    this.ribbonItem = null;
    /** 密码内存缓存：默认不落盘；rememberPassword=false 时仅存此处，重启后需重输 */
    this.passwordCache = "";
    this.syncTimer = null;
    this.debounceTimer = null;
    /** 正在同步中，避免引擎写回文件时触发本地事件造成回环 */
    this.syncing = false;
    /** 移动端同步进度提示（顶部常驻 Notice），桌面端用状态栏即可 */
    this.progressNotice = null;
    /** 设置页「立即同步」按钮引用，用于实时反映进度（无论由谁触发同步） */
    this.activeSyncButton = null;
  }
  /* ---------------- 生命周期 ---------------- */
  async onload() {
    await this.loadSettings();
    this.engine = new SyncEngine(this);
    this.engine.onProgress = (p) => this.onSyncProgress(p);
    this.refreshStatusBarVisibility();
    this.refreshRibbonVisibility();
    this.updateRibbon("idle");
    this.addSettingTab(new SyncSettingTab(this.app, this));
    this.addCommand({
      id: "wbav-sync-now",
      name: "\u7ACB\u5373\u540C\u6B65",
      callback: () => this.syncNow()
    });
    this.addCommand({
      id: "wbav-toggle-realtime",
      name: "\u5207\u6362\u5B9E\u65F6\u540C\u6B65\u5F00\u5173",
      callback: () => this.toggleRealtime()
    });
    this.addCommand({
      id: "wbav-status",
      name: "\u663E\u793A\u540C\u6B65\u72B6\u6001",
      callback: () => new import_obsidian3.Notice(
        `\u4E0A\u6B21\u540C\u6B65\uFF1A${this.index.lastSyncTime ? new Date(this.index.lastSyncTime).toLocaleString() : "\u5C1A\u672A\u540C\u6B65"}`
      )
    });
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
    this.restartInterval();
    if (this.settings.serverUrl) {
      setTimeout(() => this.syncNow(), 3e3);
    }
  }
  onunload() {
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
  async loadSettings() {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || {});
    this.index = data?.index || { version: 1, lastSyncTime: 0, files: {} };
    if (this.settings.rememberPassword) {
      this.passwordCache = this.settings.password || "";
    } else {
      this.settings.password = "";
      this.passwordCache = "";
    }
  }
  async saveSettings() {
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
  async getPassword() {
    if (this.passwordCache) return this.passwordCache;
    return new Promise((resolve) => {
      new PasswordPromptModal(this.app, this, (value) => {
        this.passwordCache = value;
        resolve(value);
      }).open();
    });
  }
  /* ---------------- 事件处理 ---------------- */
  /** 本地文件变更回调（创建/修改/删除） */
  onLocalChange(file) {
    if (file instanceof import_obsidian3.TFile) {
      this.onLocalChangeByName(file.path);
    } else {
      this.onLocalChangeByName(file.path);
    }
  }
  /** 按路径触发（含 rename 旧路径） */
  onLocalChangeByName(_path) {
    if (!this.settings.enableRealtime) return;
    if (this.syncing) return;
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.syncNow();
    }, 300);
  }
  /* ---------------- 同步控制 ---------------- */
  async syncNow() {
    if (this.syncing) return;
    if (!this.settings.serverUrl) {
      new import_obsidian3.Notice("\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 WebDAV \u670D\u52A1\u5668\u5730\u5740");
      return;
    }
    try {
      await this.engine.sync();
    } catch (e) {
      if (!import_obsidian3.Platform.isMobile) {
        new import_obsidian3.Notice("\u540C\u6B65\u51FA\u9519\uFF1A" + describeNetworkError(e));
      }
    }
  }
  toggleRealtime() {
    this.settings.enableRealtime = !this.settings.enableRealtime;
    this.saveSettings();
    new import_obsidian3.Notice(
      "\u5B9E\u65F6\u540C\u6B65\u5DF2" + (this.settings.enableRealtime ? "\u5F00\u542F" : "\u5173\u95ED")
    );
  }
  /** 重启定时同步定时器（间隔改变时调用） */
  restartInterval() {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    const mins = this.settings.syncInterval;
    if (mins > 0) {
      this.syncTimer = window.setInterval(
        () => this.syncNow(),
        mins * 60 * 1e3
      );
    }
  }
  /* ---------------- 状态栏 ---------------- */
  refreshStatusBarVisibility() {
    if (this.settings.statusBarEnabled) {
      if (!this.statusBarItem) {
        this.statusBarItem = this.addStatusBarItem();
        this.statusBarItem.addClass("wbav-statusbar");
        this.updateStatusBar("idle", "\u672A\u540C\u6B65");
      }
    } else if (this.statusBarItem) {
      this.statusBarItem.remove();
      this.statusBarItem = null;
    }
  }
  updateStatusBar(status, message) {
    if (!this.statusBarItem) return;
    const icon = status === "syncing" ? "sync" : status === "success" ? "check" : status === "error" ? "alert-triangle" : status === "offline" ? "wifi-off" : "cloud";
    this.statusBarItem.empty();
    const iconEl = this.statusBarItem.createSpan({ cls: "wbav-icon" });
    (0, import_obsidian3.setIcon)(iconEl, icon);
    const textEl = this.statusBarItem.createSpan({
      cls: "wbav-text",
      text: " " + message
    });
    this.statusBarItem.setAttribute("aria-label", "\u70B9\u51FB\u7ACB\u5373\u540C\u6B65");
    this.statusBarItem.onClickEvent(() => this.syncNow());
  }
  /* ---------------- 左侧边栏（功能区）按钮 ---------------- */
  /** 根据设置创建 / 移除左侧边栏的同步按钮 */
  refreshRibbonVisibility() {
    if (this.settings.ribbonEnabled) {
      if (!this.ribbonItem) {
        this.ribbonItem = this.addRibbonIcon(
          "refresh-cw",
          "WebDAV Sync\uFF1A\u70B9\u51FB\u7ACB\u5373\u540C\u6B65",
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
  updateRibbon(status) {
    if (!this.ribbonItem) return;
    const icon = status === "syncing" ? "refresh-cw" : status === "success" ? "check" : status === "error" ? "alert-triangle" : status === "offline" ? "wifi-off" : "refresh-cw";
    const label = status === "syncing" ? "WebDAV Sync\uFF1A\u540C\u6B65\u4E2D\u2026" : status === "success" ? "WebDAV Sync\uFF1A\u540C\u6B65\u5B8C\u6210\uFF0C\u70B9\u51FB\u518D\u6B21\u540C\u6B65" : status === "error" ? "WebDAV Sync\uFF1A\u540C\u6B65\u51FA\u9519\uFF0C\u70B9\u51FB\u91CD\u8BD5" : status === "offline" ? "WebDAV Sync\uFF1A\u5DF2\u8DF3\u8FC7\uFF08\u975E WiFi \u7F51\u7EDC\uFF09" : "WebDAV Sync\uFF1A\u70B9\u51FB\u7ACB\u5373\u540C\u6B65";
    (0, import_obsidian3.setIcon)(this.ribbonItem, icon);
    this.ribbonItem.toggleClass("wbav-spin", status === "syncing");
    this.ribbonItem.setAttribute("aria-label", label);
    this.ribbonItem.setAttribute("title", label);
  }
  onSyncProgress(p) {
    this.updateStatusBar(p.status, p.message);
    this.updateRibbon(p.status);
    if (this.activeSyncButton) {
      if (p.status === "syncing") {
        this.activeSyncButton.disabled = true;
        const m = /(\d+)\s*\/\s*(\d+)/.exec(p.message);
        this.activeSyncButton.textContent = m ? `${m[1]}/${m[2]}` : "\u540C\u6B65\u4E2D\u2026";
      } else {
        this.activeSyncButton.disabled = false;
        this.activeSyncButton.textContent = "\u7ACB\u5373\u540C\u6B65";
      }
    }
    if (import_obsidian3.Platform.isMobile) {
      if (p.status === "syncing") {
        if (!this.progressNotice) {
          this.progressNotice = new import_obsidian3.Notice(p.message, 0);
        } else {
          this.progressNotice.setMessage(p.message);
        }
      } else {
        if (this.progressNotice) {
          const n = this.progressNotice;
          this.progressNotice = null;
          n.setMessage(p.message);
          setTimeout(() => n.hide(), 4e3);
        } else if (p.status === "error" || p.status === "offline") {
          new import_obsidian3.Notice(p.message, 5e3);
        }
      }
    }
  }
};
var PasswordPromptModal = class extends import_obsidian3.Modal {
  constructor(app, plugin, onSubmit) {
    super(app);
    this.value = "";
    this.plugin = plugin;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: "\u8F93\u5165 WebDAV \u5BC6\u7801" });
    const user = this.plugin.settings.username || "(\u672A\u8BBE\u7F6E\u8D26\u53F7)";
    contentEl.createEl("p", {
      text: `\u8D26\u53F7\uFF1A${user}\u3000\uFF08\u5BC6\u7801\u4EC5\u672C\u6B21\u4FDD\u5B58\u5728\u5185\u5B58\uFF0C\u4E0D\u4F1A\u5199\u5165\u78C1\u76D8\uFF09`,
      cls: "wbav-hint"
    });
    let inputEl = null;
    new import_obsidian3.Setting(contentEl).setName("\u5BC6\u7801").addText((text) => {
      text.inputEl.type = "password";
      text.setPlaceholder("\u8BF7\u8F93\u5165 WebDAV \u5BC6\u7801").onChange((v) => this.value = v);
      inputEl = text.inputEl;
    });
    new import_obsidian3.Setting(contentEl).addButton(
      (btn) => btn.setButtonText("\u786E\u5B9A").setCta().onClick(() => {
        this.close();
        this.onSubmit(this.value);
      })
    ).addButton(
      (btn) => btn.setButtonText("\u53D6\u6D88").onClick(() => {
        this.close();
        this.onSubmit("");
      })
    );
    setTimeout(() => inputEl?.focus(), 30);
  }
  onClose() {
    this.contentEl.empty();
  }
};
