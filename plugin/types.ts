/**
 * types.ts — 插件全部类型定义
 * 集中管理配置项、同步状态、索引结构，避免类型散落各处。
 */

/** 冲突处理策略 */
export type ConflictStrategy =
  | "latest" // 最新优先：比较两端修改时间，较新的一方覆盖较旧的一方
  | "local" // 本地优先：始终以本地文件覆盖远端
  | "remote" // 远端优先：始终以下载的远端文件覆盖本地
  | "dual"; // 双版本保留：本地版本保留，远端版本另存为「(remote 时间戳)」副本

/** 插件设置项（通过 Obsidian 原生 loadData/saveData 持久化） */
export interface SyncSettings {
  /** WebDAV 根地址，例如 https://sync.example.com:8080/ （必须以 / 结尾） */
  serverUrl: string;
  /** 账号 */
  username: string;
  /**
   * 密码。
   * - 当 rememberPassword=false（默认）时：此字段【不会】写入磁盘（data.json），
   *   仅保存在本次运行的内存中，重启 Obsidian 后需重新输入（通过弹窗）。
   * - 当 rememberPassword=true 时：以明文形式写入 data.json（Obsidian 的存储机制
   *   无法避免明文），仅建议在已开启 HTTPS 的场景下启用。
   */
  password: string;
  /**
   * 是否把密码明文保存在磁盘（data.json）。
   * 默认 false：密码仅存内存，最安全；代价是每次 Obsidian 重启后要重新输入一次。
   * 设为 true 可免去重复输入，但密码会以明文保存在本地 vault 中。
   */
  rememberPassword: boolean;
  /** 定时同步间隔（分钟），0 表示关闭定时同步 */
  syncInterval: number;
  /** 是否开启实时同步（监听本地文件变更后立即同步） */
  enableRealtime: boolean;
  /** 仅 WiFi 下同步（仅移动端生效，基于 navigator.connection 的最佳努力判断） */
  wifiOnly: boolean;
  /** 忽略规则，每行一条 glob，例如 *.tmp / .trash / .obsidian/workspace.json */
  ignoreRules: string;
  /** 冲突处理策略 */
  conflictStrategy: ConflictStrategy;
  /** 是否在状态栏显示同步状态 */
  statusBarEnabled: boolean;
  /** 是否在左侧边栏（功能区 ribbon）显示「立即同步」按钮 */
  ribbonEnabled: boolean;
}

/** 单个文件的同步状态指纹 */
export interface FileState {
  /** 修改时间（毫秒时间戳，来自 Obsidian 的 stat） */
  mtime: number;
  /** 文件大小（字节） */
  size: number;
  /** 内容 SHA-256 哈希（十六进制） */
  hash: string;
}

/** 删除墓碑：记录「某文件已被删除」，用于把删除事件正确传播到其它设备 */
export interface Tombstone {
  /** 删除发生的时间戳（毫秒） */
  t: number;
  /** 被删除文件当时的 SHA-256 哈希（用于判断别的设备上的副本有没有被改过） */
  hash?: string;
}

/** 本地 / 远端同步索引，用于增量同步与冲突判断 */
export interface SyncIndex {
  /** 索引格式版本 */
  version: number;
  /** 上次成功同步的时间戳（毫秒） */
  lastSyncTime: number;
  /** path -> 文件指纹 */
  files: Record<string, FileState>;
  /**
   * 上次同步后，服务器索引文件的 ETag / Last-Modified。
   * 用于「快速跳过」：下次同步先 HEAD 探测该值，若未变且本地也无变化，
   * 说明两端都没有变化，可直接结束，省去整树遍历与索引收发。
   */
  remoteIndexTag?: string;
  /**
   * path -> 删除墓碑。
   * 关键作用：区分「远端没有该文件」到底是「从来没存在」还是「被删除了」。
   * 没有它时，别的设备会把"本地有、远端没有"当成新文件重新上传（删除会"复活"）。
   */
  deleted?: Record<string, Tombstone>;
}

/** 远端文件信息（来自 WebDAV PROPFIND） */
export interface RemoteFileInfo {
  /** 相对于 WebDAV 根的路径 */
  path: string;
  /** 是否为目录 */
  isDir: boolean;
  /** 最后修改时间（毫秒） */
  mtime: number;
  /** 文件大小（字节） */
  size: number;
}

/** 同步引擎对外暴露的进度状态 */
export type SyncStatus =
  | "idle" // 空闲
  | "syncing" // 同步中
  | "success" // 成功
  | "error" // 出错
  | "offline"; // 未连接 / 被条件（如仅 WiFi）阻止

/** 同步进度回调载荷 */
export interface SyncProgress {
  status: SyncStatus;
  message: string;
  uploaded: number;
  downloaded: number;
  deleted: number;
  conflicts: number;
  errors: number;
  total: number;
}

/** 设置默认值 */
export const DEFAULT_SETTINGS: SyncSettings = {
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
    "*.tmp",
  ].join("\n"),
  conflictStrategy: "latest",
  statusBarEnabled: true,
  ribbonEnabled: true,
};
