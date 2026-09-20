# -*- coding: utf-8 -*-
"""verify_backup.py — 校验回收区完整性（文件数 / 总字节 / 逐文件大小）

前置：先运行 plan_cleanup.py 生成 work/cleanup_plan.json（本脚本据此确定回收批次与期望清单）。
"""
import json, os
import dav

ROOT = os.path.dirname(os.path.abspath(__file__))
plan = json.load(open(os.path.join(ROOT, "work", "cleanup_plan.json"), encoding="utf-8"))
TRASH = "_obsidian_webdav_sync_trash/" + plan["trash_batch"]


def list_tree(base):
    """返回 (files{rel:size}, dirs[])"""
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


expected = plan["sizes"]           # 原路径 -> 大小
exp_bytes = sum(expected.values())

tf, tdirs = list_tree(TRASH)
# 回收区内的相对路径 = 去掉回收区前缀
rel = {}
for p, sz in tf.items():
    assert p.startswith(TRASH + "/"), p
    rel[p[len(TRASH) + 1:]] = sz

print("回收区文件数:", len(rel), " 目录数:", len(tdirs))
print("计划文件数  :", len(expected))
print("回收区总大小: %.1f MB" % (sum(rel.values()) / 1024 / 1024))
print("计划总大小  : %.1f MB" % (exp_bytes / 1024 / 1024))

miss = sorted(set(expected) - set(rel))
extra = sorted(set(rel) - set(expected))
diff = sorted(p for p in set(expected) & set(rel) if expected[p] != rel[p])

print("\n缺失(计划有、回收区无):", len(miss))
for p in miss[:20]:
    print("   ", p)
print("多余(回收区有、计划无):", len(extra))
for p in extra[:20]:
    print("   ", p)
print("大小不一致:", len(diff))
for p in diff[:20]:
    print("   ", p, expected[p], "->", rel[p])

print("\n结论:", "✅ 备份完整" if not (miss or extra or diff) else "⚠️ 存在差异，先不要删除原文件")
