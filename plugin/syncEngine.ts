/**
 * syncEngine.ts — 核心同步引擎
 *
 * 职责：
 *  1. 封装 WebDAV 客户端（PROPFIND/GET/PUT/DELETE/MKCOL/MOVE），跨桌面端/移动端通用；
 *  2. 基于 SHA-256 内容哈希 + 修改时间双重校验文件变更；
 *  3. 首次全量同步 + 日常增量同步；
 *  4. 四种冲突处理策略；
 *  5. 默认忽略规则 + 用户自定义忽略规则；
 *  6. 通过回调上报同步进度与错误。
 *
 * 设计要点（移动端兼容）：
 *  - 禁止使用 Node 专属 API（fs/crypto/buffer 原生模块），统一使用 Obsidian 的
 *    requestUrl / vault.adapter，以及浏览器标准的 crypto.subtle / DOMParser / btoa，
 *    三者均可在桌面端（Electron）与移动端（WebView）运行。
 */

import { requestUrl, Platform } from "obsidian";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
import type WebDavSyncPlugin from "./main";
import type {
  ConflictStrategy,
  FileState,
  RemoteFileInfo,
  SyncIndex,
  SyncProgress,
  SyncStatus,
  Tombstone,
} from "./types";

/** 远端元数据索引文件名（存放在 WebDAV 根目录，用于无下载即可获知远端内容哈希） */
const META_INDEX_PATH = "_obsidian_webdav_sync_index.json";
/** 元数据所在目录（整目录忽略，避免被当作笔记同步） */
const META_DIR_PREFIX = "_obsidian_webdav_sync";

/** ------------------------------------------------------------------ */
/* 通用工具函数                                                         */
/** ------------------------------------------------------------------ */

/** UTF-8 安全的 Base64 编码（用于 Basic Auth） */
function b64encode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** 计算 ArrayBuffer 的 SHA-256 十六进制摘要（浏览器标准接口，跨端可用） */
async function sha256(buffer: ArrayBuffer): Promise<string> {
  const subtle =
    (globalThis as any).crypto?.subtle || (window as any).crypto?.subtle;
  const digest = await subtle.digest("SHA-256", buffer);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** 对每个路径分段做 URL 编码，保留斜杠 */
function encodePath(relPath: string): string {
  return relPath
    .split("/")
    .map((seg) => (seg === "" ? "" : encodeURIComponent(seg)))
    .join("/");
}

/** glob 转 RegExp（支持 *  ?  ** ） */
function globToRegExp(glob: string): RegExp {
  let re = "";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*"; // ** 跨目录
        i += 2;
        if (glob[i] === "/") i++; // 消费 ** 后的斜杠
      } else {
        re += "[^/]*"; // * 不匹配斜杠
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

/** 判断 path 是否匹配某条忽略规则（目录规则同时匹配其下所有文件） */
function matchGlob(pattern: string, path: string): boolean {
  let p = pattern.trim();
  if (!p) return false;
  if (p.endsWith("/")) p = p.slice(0, -1);
  const regexes = [
    globToRegExp(p),
    globToRegExp(p + "/**"),
    globToRegExp(p + "/*"),
  ];
  return regexes.some((r) => r.test(path));
}

/** 限制并发的 map：同时最多 limit 个任务在跑，全部完成才返回 */
async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
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

/**
 * 把底层网络错误翻译成可读中文提示，方便定位问题。
 * Obsidian 的 requestUrl 抛出的是浏览器/Electron 的 net:: 错误码，
 * 直接展示给用户很难理解，这里做一层映射。
 */
export function describeNetworkError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  const m = raw.match(/net::[A-Z_]+/i);
  const code = m ? m[0].toUpperCase() : "";
  const suffix = code ? `（${code}）` : "";

  // ---- 移动端专属：明文 HTTP 被系统策略拦截 ----
  // Android 9+ / iOS 默认禁止 clear text（明文）请求，会直接抛出
  // "Cleartext HTTP traffic to xxx not permitted"。
  if (/cleartext/i.test(raw)) {
    return (
      `系统拦截了明文 HTTP 请求${suffix}：当前用的是 http:// 地址，而手机系统默认禁止明文传输。\n` +
      `可选做法：\n` +
      `① 确认服务端确实开了明文端口，且端口号没写错（本方案：8080 是 HTTPS，8081 是明文 HTTP）；\n` +
      `② 若必须走 https，请让服务器换成**受信任证书**（如 Let's Encrypt），手机无需安装任何证书即可直连；\n` +
      `③ 自签名证书无法绕过这条限制——即使手机上装了证书，安卓 App 默认也不会采用。`
    );
  }

  // ---- 移动端专属：证书不被系统/App 信任（安卓原生 SSL 栈的报错文案） ----
  if (/CertPathValidatorException|Trust anchor for certification path not found|SSLHandshakeException/i.test(raw)) {
    return (
      `服务器证书不被本机信任${suffix}。⚠️ 这是安卓端的典型表现：Android 7+ 的 App 默认只信任「系统内置 CA」，` +
      `你手动安装的证书对它不起作用。\n` +
      `解决办法：\n` +
      `① 手机端改填服务端的**明文端口**（本方案为 http://服务器IP:8081/），插件会以明文方式同步；\n` +
      `② 或把服务器证书换成受信任的正式证书（Let's Encrypt），地址再换回 https://服务器IP:8080/（推荐，一劳永逸）。`
    );
  }

  switch (code) {
    case "NET::ERR_EMPTY_RESPONSE":
      return (
        `服务端建立了 TCP 连接但没有返回任何 HTTP 数据${suffix}。常见原因：\n` +
        `① 协议不匹配——服务端是 HTTPS 却用 http:// 访问，或反之；\n` +
        `② 电脑上的系统代理/VPN（如 Clash、V2Ray、公司代理）拦截了该请求，请关闭代理后重试；\n` +
        `③ 8080 端口被别的程序占用，或容器没真正跑起来（在服务器上执行 docker ps / docker logs obsidian-webdav 查看）。`
      );
    case "NET::ERR_CONNECTION_REFUSED":
      return `目标端口拒绝连接${suffix}。说明服务器上 8080 端口没有程序在监听：检查容器是否 Up（docker ps）、端口映射是否为 8080:8080。`;
    case "NET::ERR_CONNECTION_TIMED_OUT":
    case "NET::ERR_TIMED_OUT":
      return `连接超时${suffix}。通常是防火墙/云安全组没有放行 8080 端口，或服务器 IP/端口填错。`;
    case "NET::ERR_NAME_NOT_RESOLVED":
      return `域名无法解析${suffix}。请检查服务器地址拼写，或改用 IP 直连。`;
    case "NET::ERR_SSL_PROTOCOL_ERROR":
      return `HTTPS 握手失败${suffix}。若服务端已启用 HTTPS，请确认地址用的是 https://；反之若服务端是 HTTP，请改用 http://。`;
    case "NET::ERR_CERT_AUTHORITY_INVALID":
    case "NET::ERR_CERT_COMMON_NAME_INVALID":
    case "NET::ERR_CERT_DATE_INVALID":
      return (
        `服务器证书不被信任${suffix}。若服务端用的是自签名证书（本方案默认），` +
        `需要在设备上信任该证书后重试：\n` +
        `① 电脑端：浏览器访问一次 https://服务器地址:端口/ ，按提示「继续访问」并把证书加入系统信任；\n` +
        `② 手机端：安装并信任该证书（Android 需在「安全-加密与凭据-安装证书」中导入）；\n` +
        `③ 追求零弹窗：改用受信任证书（如 Let's Encrypt），替换服务器 ./ssl 目录后重启容器。\n` +
        `临时排查可先改用 http:// 直连（密码将明文传输，不推荐长期使用）。`
      );
    case "NET::ERR_CONNECTION_RESET":
    case "NET::ERR_CONNECTION_CLOSED":
      return `连接被对端重置${suffix}。多为中间设备（代理/防火墙）拦截，或服务端进程异常退出。`;
    default:
      return raw;
  }
}

/** ------------------------------------------------------------------ */
/* WebDAV 客户端                                                        */
/** ------------------------------------------------------------------ */

class WebDavClient {
  private base: string;
  private authHeader: string;

  constructor(serverUrl: string, username: string, password: string) {
    // 规整 base 地址：
    // 1) 若用户忘记写协议头（如直接填 "sync.example.com:8080/"），则自动补全为
    //    http://。否则拼出的 URL 非法，requestUrl 会直接抛错；
    // 2) 确保以 / 结尾，避免与相对路径拼接出错（如变成 ...:8080notename.md）。
    let base = serverUrl.trim();
    if (base && !/^https?:\/\//i.test(base)) {
      base = "http://" + base;
    }
    if (!base.endsWith("/")) base += "/";
    this.base = base;
    this.authHeader =
      "Basic " + b64encode(`${username}:${password}`);
  }

  private buildUrl(relPath: string): string {
    if (!relPath || relPath === "/") return this.base;
    return this.base + encodePath(relPath);
  }

  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    return { Authorization: this.authHeader, ...extra };
  }

  /** 将 WebDAV 返回的 href 转换为相对于根的路径 */
  private hrefToPath(href: string): string {
    let p: string;
    if (/^https?:\/\//i.test(href)) {
      try {
        p = new URL(href).pathname;
      } catch {
        p = href;
      }
    } else {
      p = href;
    }
    // 去掉 base 路径前缀
    try {
      const basePath = new URL(this.base).pathname; // 例如 "/"
      if (basePath !== "/" && basePath.length > 1 && p.startsWith(basePath)) {
        p = p.slice(basePath.length);
      }
    } catch {
      /* ignore */
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
  async propfind(relPath: string, depth: "0" | "1" | "infinity" = "1"): Promise<RemoteFileInfo[]> {
    const body = `<?xml version="1.0" encoding="utf-8" ?>
<propfind xmlns="DAV:"><prop>
<getlastmodified/>
<getcontentlength/>
<resourcetype/>
</prop></propfind>`;

    const param: RequestUrlParam = {
      url: this.buildUrl(relPath),
      method: "PROPFIND",
      headers: this.authHeaders({
        Depth: depth,
        "Content-Type": "application/xml; charset=utf-8",
      }),
      body,
    };

    const res = await requestUrl(param);
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`PROPFIND 失败，HTTP ${res.status}`);
    }
    return this.parsePropfind(res.text);
  }

  /** 递归列举整棵目录树（并行展开各子目录，避免逐层串行） */
  async listRecursive(relPath: string): Promise<RemoteFileInfo[]> {
    const top = await this.propfind(relPath, "1");
    const out: RemoteFileInfo[] = [];
    const dirs: string[] = [];
    for (const item of top) {
      if (item.path === relPath) continue; // 跳过自身
      // 【性能/安全】跳过元数据区（`_obsidian_webdav_sync_index.json` 与
      // `_obsidian_webdav_sync_trash/` 回收区）。它们不参与笔记同步，
      // 若纳入遍历，每次全量同步都要白白多枚举上千个条目（回收区可能很大），
      // 且一旦被当成"远端新文件"就会下载回本地。
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
  async listAll(relPath: string): Promise<RemoteFileInfo[]> {
    try {
      return await this.propfind(relPath, "infinity");
    } catch {
      return await this.listRecursive(relPath);
    }
  }

  private parsePropfind(xml: string): RemoteFileInfo[] {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    // 【关键修复 · 远端列表恒为空的根因】
    // DAV 响应体是带命名空间前缀的：nginx 返回 <D:response> / <D:propstat>。
    // 浏览器解析 XML 时 getElementsByTagName("response") 按「限定名(qualified name)」
    // 匹配，而 <D:response> 的限定名是 "D:response"，故永远匹配不到 "response"
    // → responses 恒为空数组 → 远端文件清单永远为空 → 插件只会上传、永不下载
    //   （服务器上的文件因此再也拉不回本地）。改用按 localName 递归匹配，忽略前缀。
    const responses = this.collectByLocalName(doc, "response");
    const result: RemoteFileInfo[] = [];

    for (const resp of responses) {
      const href = this.findChildText(resp, "href");
      if (!href) continue;
      const path = this.hrefToPath(href);

      let isDir = false;
      let mtime = 0;
      let size = 0;

      // 兼容 <propstat><prop>... 与平铺结构
      // 同样不能用 getElementsByTagName("propstat")（前缀问题），改按 localName 匹配
      const propstats = this.collectByLocalName(resp, "propstat");
      const propEls = propstats.length
        ? propstats
            .map((ps) => this.findChild(ps, "prop"))
            .filter(Boolean)
        : [resp];
      for (const prop of propEls as Element[]) {
        // 【关键修复】DAV 规范中 collection 是 <resourcetype> 的子元素：
        //   <prop><resourcetype><collection/></resourcetype></prop>
        // 只判断 prop 的直接子元素会永远判定为「非目录」，导致 listRecursive
        // 从不递归（只拿到第一层），进而把整库误判为「远端已删除」而删光本地文件。
        // 这里同时兼容两种返回形态。
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
  private findChild(parent: Element, localName: string): Element | null {
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 1) {
        const el = child as Element;
        if (el.localName === localName) return el;
      }
    }
    return null;
  }

  private findChildText(parent: Element, localName: string): string | null {
    const el = this.findChild(parent, localName);
    return el && el.textContent ? el.textContent.trim() : null;
  }

  /**
   * 递归收集所有 localName 匹配的后代元素（忽略命名空间前缀）。
   * 等价于 getElementsByTagNameNS("*", localName)，但不依赖浏览器对命名空间的
   * 匹配差异，行为最稳定。专门用于替代 getElementsByTagName，
   * 后者在 XML 文档里按「限定名」匹配，遇到 <D:response> 这类带前缀的元素会失效。
   */
  private collectByLocalName(root: Document | Element, localName: string): Element[] {
    const out: Element[] = [];
    const walk = (node: Node): void => {
      const children = node.childNodes;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.nodeType === 1) {
          const el = child as Element;
          if (el.localName === localName) out.push(el);
          walk(el);
        }
      }
    };
    walk(root as unknown as Node);
    return out;
  }

  /**
   * 轻量探测：HEAD 请求，只取响应头（ETag / Last-Modified），不下载内容。
   * 用于判断「服务器上的某个文件有没有变」，开销极小（几十字节）。
   * 失败或文件不存在时返回 null。
   */
  async head(
    relPath: string
  ): Promise<{ etag: string | null; lastModified: string | null } | null> {
    try {
      const res = await requestUrl({
        url: this.buildUrl(relPath),
        method: "HEAD",
        headers: this.authHeaders(),
        throw: false,
      });
      if (res.status < 200 || res.status >= 300) return null;
      const h = (res.headers || {}) as Record<string, string>;
      return {
        etag: h["etag"] || h["ETag"] || null,
        lastModified: h["last-modified"] || h["Last-Modified"] || null,
      };
    } catch {
      return null;
    }
  }

  /** GET 下载文件内容为 ArrayBuffer */
  async get(relPath: string): Promise<ArrayBuffer> {
    const res = await requestUrl({
      url: this.buildUrl(relPath),
      method: "GET",
      headers: this.authHeaders(),
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`下载失败 ${relPath}，HTTP ${res.status}`);
    return res.arrayBuffer;
  }

  /** HEAD 风格的可用性探测（实际用 PROPFIND 根目录） */
  async testConnection(): Promise<void> {
    if (!this.base || this.base === "/") {
      throw new Error("请先填写服务器地址，例如 http://1.2.3.4:8080/");
    }
    let res;
    try {
      res = await requestUrl({
        url: this.base,
        method: "PROPFIND",
        headers: this.authHeaders({
          Depth: "0",
          "Content-Type": "application/xml; charset=utf-8",
        }),
        body: `<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:"><prop><getlastmodified/></prop></propfind>`,
      });
    } catch (e) {
      // 网络层错误：翻译成可读提示
      throw new Error(describeNetworkError(e));
    }
    if (res.status < 200 || res.status >= 300)
      throw new Error(`连接测试失败，HTTP ${res.status}`);
  }

  /** PUT 上传文件（自动创建父目录） */
  async put(relPath: string, data: ArrayBuffer): Promise<void> {
    await this.ensureParentDir(relPath);
    const res = await requestUrl({
      url: this.buildUrl(relPath),
      method: "PUT",
      headers: this.authHeaders({
        "Content-Type": "application/octet-stream",
      }),
      body: data,
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`上传失败 ${relPath}，HTTP ${res.status}`);
  }

  /** DELETE 删除文件/目录 */
  async delete(relPath: string): Promise<void> {
    const res = await requestUrl({
      url: this.buildUrl(relPath),
      method: "DELETE",
      headers: this.authHeaders(),
    });
    if (res.status < 200 || res.status >= 300)
      throw new Error(`删除失败 ${relPath}，HTTP ${res.status}`);
  }

  /** MKCOL 创建目录（已存在则忽略） */
  async mkcol(relPath: string): Promise<void> {
    try {
      await requestUrl({
        url: this.buildUrl(relPath),
        method: "MKCOL",
        headers: this.authHeaders(),
      });
    } catch {
      /* 405/409 已存在，忽略 */
    }
  }

  private createdDirs = new Set<string>();

  /** 确保某文件路径的父目录存在（用 Set 缓存，避免对同目录重复 MKCOL） */
  private async ensureParentDir(relPath: string): Promise<void> {
    const parts = relPath.split("/").slice(0, -1);
    let cur = "";
    for (const part of parts) {
      cur = cur ? cur + "/" + part : part;
      if (this.createdDirs.has(cur)) continue;
      await this.mkcol(cur);
      this.createdDirs.add(cur);
    }
  }
}

/** ------------------------------------------------------------------ */
/* 同步引擎                                                             */
/** ------------------------------------------------------------------ */

interface LocalFileInfo {
  path: string;
  mtime: number;
  size: number;
  hash: string;
}

export class SyncEngine {
  plugin: WebDavSyncPlugin;
  client: WebDavClient | null = null;
  /** 进度回调（由插件注入，用于刷新状态栏） */
  onProgress: ((p: SyncProgress) => void) | null = null;

  constructor(plugin: WebDavSyncPlugin) {
    this.plugin = plugin;
  }

  private get app() {
    return this.plugin.app;
  }

  /** 用给定的密码构建 WebDAV 客户端 */
  private createClient(password: string): WebDavClient {
    const s = this.plugin.settings;
    return new WebDavClient(s.serverUrl, s.username, password);
  }

  /** 连接测试 */
  async testConnection(): Promise<void> {
    const password = await this.plugin.getPassword();
    const client = this.createClient(password);
    await client.testConnection();
  }

  /** 判断是否需要忽略该路径（默认规则 + 用户自定义规则） */
  isIgnored(path: string): boolean {
    if (path.startsWith(META_DIR_PREFIX)) return true;
    const rules = this.plugin.settings.ignoreRules
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);
    return rules.some((rule) => matchGlob(rule, path));
  }

  /** 移动端仅在 WiFi/有线网络下才允许同步（最佳努力判断） */
  private allowByNetwork(): boolean {
    const s = this.plugin.settings;
    if (!s.wifiOnly) return true;
    if (!Platform.isMobile) return true;
    const conn = (navigator as any).connection;
    if (!conn || !conn.type) return true; // 无法判断时放行
    return conn.type === "wifi" || conn.type === "ethernet";
  }

  /** 获取本地文件清单（含哈希，已变更才重算哈希，实现增量） */
  private async getLocalFiles(): Promise<LocalFileInfo[]> {
    const files = this.app.vault.getFiles();
    const index = this.plugin.index.files;
    const out: LocalFileInfo[] = [];

    for (const f of files) {
      if (this.isIgnored(f.path)) continue;
      const prev = index[f.path];
      let hash = "";
      const unchanged =
        prev && prev.mtime === f.stat.mtime && prev.size === f.stat.size;
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
  private async loadRemoteIndex(): Promise<SyncIndex> {
    const client = this.client!;
    try {
      const buf = await client.get(META_INDEX_PATH);
      const text = new TextDecoder().decode(buf);
      const parsed = JSON.parse(text);
      if (parsed && parsed.files) return parsed as SyncIndex;
    } catch {
      /* 远端尚无索引，视为空 */
    }
    return { version: 1, lastSyncTime: 0, files: {} };
  }

  /** 上传远端元数据索引 */
  private async saveRemoteIndex(index: SyncIndex): Promise<void> {
    const client = this.client!;
    const buf = new TextEncoder().encode(JSON.stringify(index)).buffer;
    await client.put(META_INDEX_PATH, buf);
  }

  /** 确保本地父目录存在 */
  private async ensureLocalParent(relPath: string): Promise<void> {
    const dir = relPath.split("/").slice(0, -1).join("/");
    if (dir && !(await this.app.vault.adapter.exists(dir))) {
      await this.app.vault.adapter.mkdir(dir);
    }
  }

  /** 写文件到本地（新建或覆盖） */
  private async writeLocal(relPath: string, data: ArrayBuffer): Promise<void> {
    await this.ensureLocalParent(relPath);
    await this.app.vault.adapter.writeBinary(relPath, data);
  }

  /**
   * 删除本地文件：优先走 Obsidian 回收站（可恢复），失败才退回硬删除。
   * 之前直接调用 adapter.remove() 是永久删除、不进回收站，一旦误判就无法挽回。
   */
  private async trashLocal(relPath: string): Promise<void> {
    const f = this.app.vault.getAbstractFileByPath(relPath);
    const fm = this.app.fileManager as any;
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
        /* 回落到硬删除 */
      }
    }
    await this.app.vault.adapter.remove(relPath);
  }

  /** 生成「双版本保留」时的远端副本文件名，例如 note (remote 2026-09-17 1130).md */
  private remoteCopyName(path: string): string {
    const dot = path.lastIndexOf(".");
    const ext = dot > 0 ? path.slice(dot) : "";
    const base = dot > 0 ? path.slice(0, dot) : path;
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )} ${pad(d.getHours())}${pad(d.getMinutes())}`;
    return `${base} (remote ${stamp})${ext}`;
  }

  /** 主同步流程 */
  async sync(): Promise<void> {
    if (!this.plugin.settings.serverUrl) {
      this.report("error", "未配置服务器地址", 0, 0, 0, 0, 0, 0);
      throw new Error("未配置服务器地址");
    }
    if (!this.allowByNetwork()) {
      this.report("offline", "已设为仅 WiFi 同步，当前非 WiFi 环境", 0, 0, 0, 0, 0, 0);
      return;
    }

    this.plugin.syncing = true;
    this.report("syncing", "正在准备同步…", 0, 0, 0, 0, 0, 0);
    const password = await this.plugin.getPassword();
    if (!password) {
      this.report("error", "未提供密码，已取消同步", 0, 0, 0, 0, 0, 0);
      this.plugin.syncing = false;
      throw new Error("未提供密码，已取消同步");
    }
    const client = (this.client = this.createClient(password));

    try {
      // 1. 收集本地文件（增量哈希）
      const localFiles = await this.getLocalFiles();
      const localMap = new Map(localFiles.map((f) => [f.path, f]));

      // 2. 远端目录树
      const remoteListing = await client.listAll("");
      const remoteMap = new Map(
        remoteListing
          .filter((r) => !r.isDir && r.path !== META_INDEX_PATH)
          .map((r) => [r.path, r])
      );
      const remoteDirSet = new Set(
        remoteListing.filter((r) => r.isDir).map((r) => r.path)
      );

      // 3. 本地索引（上次同步指纹）—— 先取它，才能判断「本地有没有变化」
      const localIndexMap = this.plugin.index.files;

      // ---- 快速跳过：HEAD 探测服务器索引文件的 ETag ----
      // 若与上次同步后记录的一致，说明「远端自上次以来一字未变」；再叠加「本地也没变」，
      // 即可直接结束，省掉整棵目录树的遍历（约 880KB）与索引的收发（约 730KB）。
      let remoteTag: string | null = null;
      try {
        const h = await client.head(META_INDEX_PATH);
        remoteTag = h ? h.etag || h.lastModified || null : null;
      } catch {
        remoteTag = null;
      }
      const localChanged =
        localFiles.length !== Object.keys(localIndexMap).length ||
        localFiles.some((f) => {
          const prev = localIndexMap[f.path];
          return !prev || prev.mtime !== f.mtime || prev.size !== f.size;
        });
      const remoteUnchanged =
        !!remoteTag && remoteTag === this.plugin.index.remoteIndexTag;

      if (remoteUnchanged && !localChanged) {
        this.plugin.index.lastSyncTime = Date.now();
        await this.plugin.saveSettings();
        this.report(
          "success",
          "同步完成 ✓（两端均无变化，已跳过全量扫描）",
          0,
          0,
          0,
          0,
          0,
          0
        );
        return;
      }

      // 4. 远端元数据索引（含内容哈希 + 删除墓碑）
      const remoteIndex = await this.loadRemoteIndex();
      const remoteIndexMap = remoteIndex.files;
      // 删除墓碑：记录「某文件已被删除」，让其它设备据此删掉各自副本，
      // 而不是把「本地有、远端没有」误当成新文件又传上去（否则删除会"复活"）。
      const tombstones: Record<string, Tombstone> = (remoteIndex.deleted =
        remoteIndex.deleted || {});

      // 【关键】所有删除判定都基于「本轮同步前的索引快照」。
      // 传输阶段会往 localIndexMap / remoteIndexMap 里写入新下载/新上传的文件，
      // 若拿同步后的索引去判断，刚下载的文件会被误判为「用户已删除」→ 被误删。
      const prevLocalIndex = { ...localIndexMap };

      // 本地被删除的文件 = 上次同步记录里有、但当前本地已不存在
      const locallyDeleted = Object.keys(prevLocalIndex).filter(
        (p) => !this.isIgnored(p) && !localMap.has(p)
      );
      const locallyDeletedSet = new Set(locallyDeleted);

      // ---- 海量删除保护（针对「本地删除 → 远端删除」）----
      // 待删列表只由「本地索引记录 − 当前本地文件」推出：本地索引是上次同步的真实快照、
      // 本地文件来自 vault 自身，两个来源都可靠，因此大批量删除通常就是用户的真实意图。
      // 只保留一条兜底：本地列表异常为空（索引却有记录）时判为可疑并跳过，防止
      // "库没加载出来"这类异常被当成"用户删光了所有文件"。
      const indexCount = Object.keys(prevLocalIndex).length;
      const delLimit = Math.max(50, Math.floor(indexCount * 0.95));
      const listingSuspect = localMap.size === 0 && indexCount > 0;
      const remoteDeleteAborted =
        listingSuspect || locallyDeleted.length > delLimit;
      if (remoteDeleteAborted) {
        console.warn(
          `[WebDAV Sync] 已跳过删除传播：本地列表为空=${listingSuspect}，` +
            `待删远端=${locallyDeleted.length}，上限=${delLimit}`
        );
      }

      let up = 0,
        down = 0,
        del = 0,
        conf = 0,
        err = 0;
      const allPaths = Array.from(
        new Set<string>([
          ...localMap.keys(),
          ...remoteMap.keys(),
          ...locallyDeleted,
        ])
      ).filter((p) => !this.isIgnored(p));

      // ---- 4a. 文件增 / 改 / 冲突（并发传输）----
      let done = 0;
      const total = allPaths.length;
      const processPath = async (path: string) => {
        const local = localMap.get(path);
        const remote = remoteMap.get(path);
        try {
          // ---- (1) 本地已删除的文件：把删除同步到远端，并留下墓碑 ----
          if (locallyDeletedSet.has(path)) {
            if (!remote) {
              // 远端也没有了 → 清掉索引记录即可
              delete localIndexMap[path];
              del++;
              return;
            }
            // 远端还在：只有确认「远端内容自上次同步后没被改过」才敢删；
            // 若远端已被别的设备改过（哈希不同）或哈希缺失，则以远端为准下载回来（不删）。
            const lastAgreedHash = prevLocalIndex[path]?.hash;
            const nowRemoteHash = remoteIndexMap[path]?.hash;
            const canDeleteSafely =
              !!lastAgreedHash &&
              !!nowRemoteHash &&
              lastAgreedHash === nowRemoteHash;
            if (!canDeleteSafely) {
              const buf = await client.get(path);
              await this.writeLocal(path, buf);
              const lhash = await sha256(buf);
              const st = await this.app.vault.adapter.stat(path);
              localIndexMap[path] = {
                mtime: st ? st.mtime : remote.mtime,
                size: st ? st.size : remote.size,
                hash: lhash,
              };
              delete tombstones[path];
              down++;
            } else if (remoteDeleteAborted) {
              console.warn(`[WebDAV Sync] 已跳过删除远端 ${path}（删除保护生效）`);
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
            // ---- (2) 仅本地存在 ----
            // 可能是新文件；也可能是「别处删了、本地还留着」→ 查墓碑决定删还是传
            const tb = tombstones[path];
            if (tb) {
              const unchanged =
                (tb.hash && local.hash === tb.hash) ||
                (!tb.hash && local.mtime <= tb.t);
              if (unchanged) {
                // 是"已被删除"的旧副本 → 删本地（走回收站），不复活
                await this.trashLocal(path);
                delete localIndexMap[path];
                del++;
                return;
              }
              // 删除后又被修改 / 重建 → 视为新内容，撤销墓碑并上传
              delete tombstones[path];
            }
            const buf = await this.app.vault.adapter.readBinary(path);
            await client.put(path, buf);
            remoteIndexMap[path] = {
              mtime: local.mtime,
              size: local.size,
              hash: local.hash,
            };
            up++;
          } else if (!local && remote) {
            // ---- (3) 仅远端存在 -> 下载（文件重新出现，撤销墓碑）----
            delete tombstones[path];
            const buf = await client.get(path);
            await this.writeLocal(path, buf);
            const lhash = await sha256(buf);
            const st = await this.app.vault.adapter.stat(path);
            localIndexMap[path] = {
              // 用写入后的真实本地 mtime，避免下次同步重复重算哈希
              mtime: st ? st.mtime : remote.mtime,
              size: st ? st.size : remote.size,
              hash: lhash,
            };
            down++;
          } else if (local && remote) {
            // ---- (4) 两端都存在：该文件没有处于删除状态，撤销墓碑 ----
            delete tombstones[path];
            // 两端都存在 -> 比较哈希
            const remoteState = remoteIndexMap[path];
            let remoteHash = remoteState ? remoteState.hash : "";
            if (!remoteHash) {
              // 远端索引缺失，下载计算并缓存，避免下次重复下载
              const buf = await client.get(path);
              remoteHash = await sha256(buf);
              remoteIndexMap[path] = {
                mtime: remote.mtime,
                size: remote.size,
                hash: remoteHash,
              };
            }
            if (local.hash === remoteHash) {
              // 已一致
              return;
            }
            // 内容不同 -> 冲突
            conf++;
            const strategy: ConflictStrategy =
              this.plugin.settings.conflictStrategy;
            if (strategy === "local") {
              const buf = await this.app.vault.adapter.readBinary(path);
              await client.put(path, buf);
              remoteIndexMap[path] = {
                mtime: local.mtime,
                size: local.size,
                hash: local.hash,
              };
            } else if (strategy === "remote") {
              const buf = await client.get(path);
              await this.writeLocal(path, buf);
              const lhash = await sha256(buf);
              const st = await this.app.vault.adapter.stat(path);
              localIndexMap[path] = {
                mtime: st ? st.mtime : remote.mtime,
                size: st ? st.size : remote.size,
                hash: lhash,
              };
            } else if (strategy === "latest") {
              if (local.mtime >= remote.mtime) {
                const buf = await this.app.vault.adapter.readBinary(path);
                await client.put(path, buf);
                remoteIndexMap[path] = {
                  mtime: local.mtime,
                  size: local.size,
                  hash: local.hash,
                };
              } else {
                const buf = await client.get(path);
                await this.writeLocal(path, buf);
                const lhash = await sha256(buf);
                localIndexMap[path] = {
                  mtime: remote.mtime,
                  size: remote.size,
                  hash: lhash,
                };
              }
            } else {
              // dual：本地保留，远端版本另存为副本
              const buf = await client.get(path);
              const copyName = this.remoteCopyName(path);
              await this.writeLocal(copyName, buf);
              const cst = await this.app.vault.adapter.stat(copyName);
              const chash = await sha256(buf);
              localIndexMap[copyName] = {
                mtime: cst ? cst.mtime : remote.mtime,
                size: cst ? cst.size : remote.size,
                hash: chash,
              };
              // 远端仍以本地版本为准
              const lbuf = await this.app.vault.adapter.readBinary(path);
              await client.put(path, lbuf);
              remoteIndexMap[path] = {
                mtime: local.mtime,
                size: local.size,
                hash: local.hash,
              };
            }
          }
        } catch (e) {
          err++;
          console.error(`[WebDAV Sync] 处理 ${path} 出错:`, e);
        } finally {
          done++;
          if (done % 8 === 0 || done === total) {
            this.report(
              "syncing",
              `同步中… ${done}/${total}`,
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
        `远端 ${remoteMap.size} 个 / 本地 ${localMap.size} 个，开始同步…`,
        0,
        0,
        0,
        0,
        0,
        total
      );
      // 并发执行，移动端限流更低以免内存/连接打满
      const concurrency = Platform.isMobile ? 3 : 6;
      await mapLimit(allPaths, concurrency, processPath);

      // ---- 4b. 清理过期删除墓碑（默认保留 30 天）----
      // 墓碑用于把"删除"传播到其它设备；保留一段时间后清除，避免索引无限膨胀。
      const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
      const nowTs = Date.now();
      for (const p of Object.keys(tombstones)) {
        if (nowTs - (tombstones[p]?.t || 0) > TOMBSTONE_TTL_MS) {
          delete tombstones[p];
        }
      }

      // ---- 5. 收尾：写回索引 ----
      remoteIndex.lastSyncTime = Date.now();
      this.plugin.index.lastSyncTime = remoteIndex.lastSyncTime;
      await this.saveRemoteIndex(remoteIndex);
      // 记录索引文件的新 ETag，供下次「快速跳过」判断；
      // 本轮有错误则不记录，让下次仍全量重扫（避免漏掉失败项）。
      if (err === 0) {
        try {
          const h = await client.head(META_INDEX_PATH);
          this.plugin.index.remoteIndexTag =
            (h && (h.etag || h.lastModified)) || undefined;
        } catch {
          this.plugin.index.remoteIndexTag = undefined;
        }
      } else {
        this.plugin.index.remoteIndexTag = undefined;
      }
      await this.plugin.saveSettings();

      const msg = remoteDeleteAborted
        ? `同步完成，但已跳过删除（疑似异常：待删 ${locallyDeleted.length}，上限 ${delLimit}），请检查后重试`
        : err > 0
        ? `同步完成（${err} 个错误）`
        : `同步完成 ✓ 上传${up} 下载${down} 删除${del} 冲突${conf}`;
      this.report("success", msg, up, down, del, conf, err, total);
    } catch (e) {
      console.error("[WebDAV Sync] 同步失败:", e);
      this.report(
        "error",
        "同步失败：" + (e instanceof Error ? e.message : String(e)),
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
  private report(
    status: SyncStatus,
    message: string,
    uploaded: number,
    downloaded: number,
    deleted: number,
    conflicts: number,
    errors: number,
    total: number
  ): void {
    if (this.onProgress) {
      const p: SyncProgress = {
        status,
        message,
        uploaded,
        downloaded,
        deleted,
        conflicts,
        errors,
        total,
      };
      this.onProgress(p);
    }
  }
}
