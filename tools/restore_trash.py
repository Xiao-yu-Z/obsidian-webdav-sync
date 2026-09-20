# -*- coding: utf-8 -*-
"""
restore_trash.py — 把服务器回收区里的文件「原地还原」

用法:
  python restore_trash.py                 # 还原全部回收区
  python restore_trash.py 20260917_1757   # 只还原某个日期批次
  python restore_trash.py --list          # 只看回收区有哪些批次、多少文件

还原 = 把 `_obsidian_webdav_sync_trash/<批次>/<原路径>` 移动回 `<原路径>`。
还原后记得让各设备同步一次；若索引里还留着这些文件的「删除墓碑」，
插件看到「本地有 + 墓碑 + 内容一致」会再删一次 —— 所以还原后需要把
对应墓碑一起清掉，本脚本会自动处理。
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import dav

ROOT = os.path.dirname(os.path.abspath(__file__))
META = "_obsidian_webdav_sync_index.json"
TRASH = "_obsidian_webdav_sync_trash"


def list_files():
    files = {}

    def walk(d):
        for e in dav.propfind(d, "1"):
            p = e["path"].rstrip("/")
            if p == d.rstrip("/") or p == "":
                continue
            if e["dir"]:
                walk(p)
            else:
                files[p] = e["size"]

    walk("")
    return files


def mkdirs(paths):
    need = set()
    for p in paths:
        parts = p.split("/")
        for i in range(1, len(parts)):
            need.add("/".join(parts[:i]))
    for d in sorted(need, key=lambda x: x.count("/")):
        st, _, _ = dav.request("MKCOL", d + "/")
        if st not in (201, 405, 409):
            print("  MKCOL 异常", d, st)


def main():
    if "--list" in sys.argv:
        files = list_files()
        batches = {}
        for p in files:
            if p.startswith(TRASH + "/"):
                rest = p[len(TRASH) + 1:]
                b = rest.split("/", 1)[0]
                batches.setdefault(b, [0, 0])
                batches[b][0] += 1
                batches[b][1] += files[p]
        print("回收区批次:")
        for b, (n, sz) in sorted(batches.items()):
            print("   %-20s %5d 个文件  %.1f MB" % (b, n, sz / 1024 / 1024))
        return

    batch = None
    for a in sys.argv[1:]:
        if not a.startswith("-"):
            batch = a
    prefix = f"{TRASH}/{batch}/" if batch else f"{TRASH}/"

    files = list_files()
    items = {p: files[p] for p in files if p.startswith(prefix)}
    if not items:
        print("回收区里没有匹配的文件:", prefix)
        return
    total = sum(items.values())
    print("待还原: %d 个文件, %.1f MB" % (len(items), total / 1024 / 1024))

    def dest_of(p):
        if batch:
            return p[len(prefix):]
        rest = p[len(TRASH) + 1:]
        return rest.split("/", 1)[1]

    dests = {p: dest_of(p) for p in items}
    mkdirs(list(dests.values()))

    ok, fail = 0, []
    t0 = time.time()

    def do_move(src):
        nonlocal ok
        dst = dests[src]
        for attempt in range(3):
            st, _, _ = dav.request(
                "MOVE", src,
                headers={"Destination": dav.BASE + dav.enc(dst), "Overwrite": "T"},
            )
            if st in (201, 204):
                ok += 1
                if ok % 100 == 0:
                    print("  已还原 %d / %d (%.0fs)" % (ok, len(items), time.time() - t0))
                return
            time.sleep(0.6 * (attempt + 1))
        fail.append((src, st))

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(do_move, list(items)))

    print("还原完成: 成功 %d, 失败 %d" % (ok, len(fail)))
    for p, st in fail[:20]:
        print("   失败", st, p)

    # 清掉对应墓碑，否则下一次同步会把刚还原的文件再删一遍
    st, _, body = dav.request("GET", META)
    idx = json.loads(body.decode("utf-8"))
    deleted = idx.get("deleted", {})
    restored = set(dests[p] for p in items if p not in [f[0] for f in fail])
    removed = [p for p in deleted if p in restored]
    for p in removed:
        del deleted[p]
    if removed:
        idx["lastSyncTime"] = int(time.time() * 1000)
        payload = json.dumps(idx, ensure_ascii=False).encode("utf-8")
        st, _, _ = dav.request("PUT", META, data=payload,
                               headers={"Content-Type": "application/json"})
        print("已清除 %d 条对应墓碑 (PUT %s)" % (len(removed), st))
    else:
        print("无需清除墓碑")


if __name__ == "__main__":
    main()
