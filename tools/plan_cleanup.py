# -*- coding: utf-8 -*-
"""
plan_cleanup.py — 只读：生成「服务器清理计划」

用法:
  python plan_cleanup.py "要清理的目录1" "目录2/子目录" [--batch 20260101_1200]

把给定目录（相对服务器根的路径，可多个）整体规划为「移入隐藏回收区」；
只计算，不改动任何东西。结果写入 work/cleanup_plan.json，
供 backup_targets.py / verify_backup.py / verify_final.py 复用（含统一回收批次名）。
"""
import json
import os
import sys
import time
import collections
import dav


def _parse_args(argv):
    """位置参数=目标目录；--batch <名称> = 自定义回收批次名"""
    targets, batch = [], None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--batch":
            i += 1
            if i < len(argv):
                batch = argv[i]
        elif not a.startswith("-"):
            targets.append(a.rstrip("/"))
        i += 1
    return targets, batch


TARGETS, _BATCH = _parse_args(sys.argv[1:])
ROOT = os.path.dirname(os.path.abspath(__file__))


def _trash_batch():
    return _BATCH or time.strftime("%Y%m%d_%H%M")


def list_with_size():
    """递归列目录，返回 {path: size}（文件）与目录集合"""
    files = {}
    dirs = set()

    def walk(d):
        for e in dav.propfind(d, "1"):
            p = e["path"].rstrip("/")
            if p == d.rstrip("/") or p == "":
                continue
            if e["dir"]:
                if p.startswith("_obsidian_webdav_sync"):
                    continue
                dirs.add(p)
                walk(p)
            else:
                files[p] = e["size"]

    walk("")
    return files, dirs


def main():
    if not TARGETS:
        raise SystemExit(
            '请指定要清理的目录，例如：\n'
            '  python plan_cleanup.py "笔记/待归档" "临时目录"'
        )
    files, dirs = list_with_size()
    print("服务器物理文件数:", len(files))

    targets = sorted(p for p in files if any(p.startswith(t + "/") for t in TARGETS))
    keep = sorted(p for p in files if p not in set(targets))
    total_bytes = sum(files[p] for p in targets)

    by_dir = collections.Counter("/".join(p.split("/")[:2]) for p in targets)
    print("\n=== 待移入回收区 ===")
    for k, v in by_dir.most_common():
        print("  %-40s %5d 个" % (k, v))
    print("  合计: %d 个文件, %.1f MB" % (len(targets), total_bytes / 1024 / 1024))

    print("\n=== 保留 ===")
    for k, v in collections.Counter("/".join(p.split("/")[:2]) for p in keep).most_common():
        print("  %-40s %5d 个" % (k, v))
    print("  合计: %d 个文件" % len(keep))

    # 需要的目录（回收区里）
    need_dirs = set()
    for p in targets:
        parts = p.split("/")
        for i in range(1, len(parts)):
            need_dirs.add("/".join(parts[:i]))

    # 原目录中「只含待删文件」的目录（可直接删掉）
    orphan_dirs = set()
    for d in sorted(dirs, reverse=True):
        if any(d == t or d.startswith(t + "/") for t in TARGETS):
            child_files = [p for p in files if p.startswith(d + "/")]
            if not child_files:
                orphan_dirs.add(d)

    plan = {
        "targets": targets,
        "trash_batch": _trash_batch(),
        "sizes": {p: files[p] for p in targets},
        "keep": keep,
        "need_trash_dirs": sorted(need_dirs),
        "orphan_dirs": sorted(orphan_dirs, key=len, reverse=True),
        "total_bytes": total_bytes,
    }
    out = os.path.join(ROOT, "work", "cleanup_plan.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    json.dump(plan, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print("\n计划已保存:", out, "(回收批次:", plan["trash_batch"], ")")
    print("回收区需要创建 %d 个目录；原目录中需删除的空目录 %d 个" %
          (len(need_dirs), len(orphan_dirs)))
    print("\n前 5 个待删文件示例:")
    for p in targets[:5]:
        print("  ", p, files[p])


if __name__ == "__main__":
    main()
