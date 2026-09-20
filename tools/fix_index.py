# -*- coding: utf-8 -*-
"""
fix_index.py — 重写服务器索引：清除幽灵记录 + 为已删文件写入墓碑

为什么必须做：
  索引可能与服务器物理文件不一致（出现「幽灵记录」：索引说有、物理其实没有），
  这会让插件把并不存在的文件当成远端仍有，既不删也不报错，索引会无限漂移。
  同时，必须为被删除的文件写入「墓碑(tombstone)」，否则其它设备（手机）看到
  「本地有、远端没有」会把它当成新文件重新上传 —— 即删除"复活"。
  墓碑要覆盖「旧索引里出现过的全部目标路径」，而不只是刚被移走的那一部分。

用法:
  python fix_index.py "已删除的目录1" "目录2" ...
"""
import json
import os
import sys
import time
import collections

import dav

ROOT = os.path.dirname(os.path.abspath(__file__))
TARGETS = [t.rstrip("/") for t in sys.argv[1:] if not t.startswith("-")]
META = "_obsidian_webdav_sync_index.json"


def list_files():
    files = {}

    def walk(d):
        for e in dav.propfind(d, "1"):
            p = e["path"].rstrip("/")
            if p == d.rstrip("/") or p == "":
                continue
            if e["dir"]:
                if p.startswith("_obsidian_webdav_sync"):
                    continue
                walk(p)
            else:
                files[p] = e["size"]

    walk("")
    return files


def main():
    if not TARGETS:
        raise SystemExit(
            '请指定已删除的目录，例如：\n'
            '  python fix_index.py "笔记/待归档" "临时目录"'
        )

    # 物理现状
    physical = list_files()
    physical.pop(META, None)
    print("服务器物理文件数:", len(physical))

    # 旧索引
    st, _, body = dav.request("GET", META)
    old = json.loads(body.decode("utf-8"))
    old_files = old.get("files", {})
    print("旧索引记录数:", len(old_files), " 旧墓碑:", len(old.get("deleted", {})))

    # 保留集
    keep = sorted(physical)
    missing_hash = [p for p in keep if p not in old_files]
    print("保留文件中旧索引缺哈希的:", len(missing_hash))
    for p in missing_hash[:10]:
        print("   ", p)

    new_files = {p: old_files[p] for p in keep if p in old_files}

    # 墓碑集：旧索引里所有目标路径（含更早就消失的幽灵）+ 物理上刚移走的
    tomb_paths = set(p for p in old_files if any(p.startswith(t + "/") for t in TARGETS))
    print("按旧索引推导的墓碑数:", len(tomb_paths))

    now = int(time.time() * 1000)
    new_deleted = {}
    for p in sorted(tomb_paths):
        h = old_files.get(p, {}).get("hash")
        entry = {"t": now}
        if h:
            entry["hash"] = h
        new_deleted[p] = entry

    new_index = {
        "version": 1,
        "lastSyncTime": now,
        "files": new_files,
        "deleted": new_deleted,
    }

    print("\n新索引: files=%d, deleted=%d" % (len(new_files), len(new_deleted)))
    print("按一级目录统计 files:")
    for k, v in collections.Counter(p.split("/")[0] for p in new_files).most_common():
        print("   %-30s %d" % (k, v))

    # 本地留档
    os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
    json.dump(new_index, open(os.path.join(ROOT, "work", "new_index.json"), "w",
                              encoding="utf-8"), ensure_ascii=False)

    payload = json.dumps(new_index, ensure_ascii=False).encode("utf-8")
    print("\n索引大小: %.0f KB" % (len(payload) / 1024))
    st, hd, _ = dav.request("PUT", META, data=payload,
                            headers={"Content-Type": "application/json"})
    print("PUT 结果:", st, hd.get("ETag"))


if __name__ == "__main__":
    main()
