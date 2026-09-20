# -*- coding: utf-8 -*-
"""verify_final.py — 服务器终态校验（物理文件 vs 索引是否一致）"""
import json, os
import collections
import dav

META = "_obsidian_webdav_sync_index.json"
TRASH = "_obsidian_webdav_sync_trash"


def list_tree(base=""):
    files, dirs = {}, []

    def walk(d):
        for e in dav.propfind(d, "1"):
            p = e["path"].rstrip("/")
            if p == d.rstrip("/") or p == "":
                continue
            if e["dir"]:
                dirs.append(p)
                walk(p)
            else:
                files[p] = e["size"]

    walk(base)
    return files, dirs


files, dirs = list_tree("")
files.pop(META, None)
trash_files = [p for p in files if p.startswith(TRASH + "/")]
real = {p: v for p, v in files.items() if not p.startswith(TRASH + "/")}
trash_bytes = sum(files[p] for p in trash_files)
real_bytes = sum(real.values())

print("=== 服务器物理现状 ===")
print("参与同步的文件:", len(real), " %.1f MB" % (real_bytes / 1024 / 1024))
print("回收区文件    :", len(trash_files), " %.1f MB" % (trash_bytes / 1024 / 1024))
print("目录:")
for d in sorted(set(dirs)):
    print("   ", d)

print("\n=== 参与同步的文件明细 ===")
for k, v in collections.Counter("/".join(p.split("/")[:2]) for p in real).most_common():
    print("   %-36s %d" % (k, v))

st, _, body = dav.request("GET", META)
idx = json.loads(body.decode("utf-8"))
idx_files = idx.get("files", {})
idx_deleted = idx.get("deleted", {})

print("\n=== 索引一致性 ===")
print("索引 files  :", len(idx_files))
print("索引 deleted:", len(idx_deleted))
print("物理 vs 索引 files 差异:", len(set(real) ^ set(idx_files)))

# 若存在清理计划，则按计划里的目标目录统计墓碑覆盖情况
plan_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "work", "cleanup_plan.json")
if os.path.exists(plan_path):
    plan = json.load(open(plan_path, encoding="utf-8"))
    for t in plan.get("targets", []):
        n = sum(1 for p in idx_deleted if p == t or p.startswith(t + "/"))
        print("墓碑覆盖 %-28s %d 条" % (t, n))

ok = not (set(real) ^ set(idx_files))
print("\n结论:", "✅ 物理与索引一致" if ok else "⚠️ 请检查上面的差异")
