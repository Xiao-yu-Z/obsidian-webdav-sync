# -*- coding: utf-8 -*-
"""
backup_targets.py — 把待删文件服务端「移动」到隐藏回收区（不占额外流量，可原样还原）

前置：先运行 plan_cleanup.py 生成 work/cleanup_plan.json
      （本脚本从中读取目标目录与统一的回收批次名）。
回收区前缀 `_obsidian_webdav_sync_trash` 以 `_obsidian_webdav_sync` 开头，
插件会整体忽略（本地与远端都跳过），所以不会被重新同步回电脑/手机。

用法:
  python backup_targets.py            # 真正执行
  python backup_targets.py --dry      # 只打印
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import dav

ROOT = os.path.dirname(os.path.abspath(__file__))
DRY = "--dry" in sys.argv

PLAN = os.path.join(ROOT, "work", "cleanup_plan.json")
_plan = json.load(open(PLAN, encoding="utf-8"))
TARGETS = _plan["targets"]
TRASH = "_obsidian_webdav_sync_trash/" + _plan["trash_batch"]


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


def mkcol_tree(path):
    """逐级创建目录；409(已存在) 视为成功"""
    parts = path.strip("/").split("/")
    for i in range(1, len(parts) + 1):
        sub = "/".join(parts[:i]) + "/"
        st, _, _ = dav.request("MKCOL", sub)
        if st not in (201, 405, 409):
            print("  MKCOL 异常", sub, st)


def main():
    files = list_files()
    targets = sorted(p for p in files if any(p.startswith(t + "/") for t in TARGETS))
    print("待移动文件:", len(targets))
    print("回收区:", TRASH)

    if DRY:
        for p in targets[:10]:
            print("  ", p)
        return

    # 1. 建好回收区目录树
    need = set()
    for p in targets:
        dest = TRASH + "/" + p
        parts = dest.split("/")
        for i in range(1, len(parts)):
            need.add("/".join(parts[:i]))
    for d in sorted(need, key=lambda x: x.count("/")):
        mkcol_tree(d + "/")
    print("回收区目录准备完成:", len(need))

    # 2. 并发 MOVE
    results = {"ok": 0, "fail": []}
    lock_t = time.time()

    def do_move(src):
        dest = TRASH + "/" + src
        for attempt in range(3):
            st, _, body = dav.request(
                "MOVE", src,
                headers={"Destination": dav.BASE + dav.enc(dest), "Overwrite": "F"},
            )
            if st in (201, 204):
                break
            if st == 412:  # 目标已存在（上次跑过）
                break
            time.sleep(0.6 * (attempt + 1))
        else:
            results["fail"].append((src, st))
            return
        results["ok"] += 1
        if results["ok"] % 100 == 0:
            print("  已移动 %d / %d  (%.0fs)" %
                  (results["ok"], len(targets), time.time() - lock_t))

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(do_move, targets))

    print("移动完成: 成功 %d, 失败 %d" % (results["ok"], len(results["fail"])))
    for p, st in results["fail"][:20]:
        print("   失败", st, p)
    os.makedirs(os.path.join(ROOT, "work"), exist_ok=True)
    json.dump(results["fail"], open(os.path.join(ROOT, "work", "move_fail.json"), "w",
                                    encoding="utf-8"), ensure_ascii=False, indent=1)

    # 3. 校验
    after = list_files()
    left = [p for p in after if any(p.startswith(t + "/") for t in TARGETS)]
    print("原位置剩余文件:", len(left))
    for p in left[:20]:
        print("   仍在:", p)


if __name__ == "__main__":
    main()
