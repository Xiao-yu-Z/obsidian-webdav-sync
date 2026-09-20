# -*- coding: utf-8 -*-
"""忠实复刻新版 sync() 的算法（不含 IO），验证删除墓碑机制的各个场景"""
NOW = 1000


class Server:
    def __init__(self, files=None, deleted=None):
        self.files = dict(files or {})
        self.deleted = dict(deleted or {})


class Dev:
    def __init__(self, files=None, index=None):
        self.files = dict(files or {})
        self.index = {k: {"hash": v} for k, v in (index or {}).items()}


def syncd(dev, srv):
    localMap = dict(dev.files)
    remoteMap = dict(srv.files)
    prevLocalIndex = {p: {"hash": v["hash"]} for p, v in dev.index.items()}
    tombstones = dict(srv.deleted)

    locallyDeleted = [p for p in prevLocalIndex if p not in localMap]
    locallyDeletedSet = set(locallyDeleted)
    indexCount = len(prevLocalIndex)
    delLimit = max(50, int(indexCount * 0.4))
    listingSuspect = len(localMap) == 0 and indexCount > 0
    aborted = listingSuspect or len(locallyDeleted) > delLimit

    allPaths = set(localMap) | set(remoteMap) | locallyDeletedSet
    up = down = dele = conf = 0

    for path in sorted(allPaths):
        local = localMap.get(path)
        remote = remoteMap.get(path)

        if path in locallyDeletedSet:
            if remote is None:
                dev.index.pop(path, None)
                dele += 1
            else:
                lastAgreed = prevLocalIndex.get(path, {}).get("hash")
                nowRemote = remote
                canDel = bool(lastAgreed) and bool(nowRemote) and lastAgreed == nowRemote
                if not canDel:
                    dev.files[path] = nowRemote
                    dev.index[path] = {"hash": nowRemote}
                    tombstones.pop(path, None)
                    down += 1
                elif aborted:
                    pass
                else:
                    srv.files.pop(path, None)
                    tombstones[path] = {"t": NOW, "hash": nowRemote}
                    dev.index.pop(path, None)
                    dele += 1
            continue

        if local is not None and remote is None:
            tb = tombstones.get(path)
            if tb:
                unchanged = (tb.get("hash") and local == tb["hash"]) or (
                    not tb.get("hash")
                )
                if unchanged:
                    dev.files.pop(path, None)
                    dev.index.pop(path, None)
                    dele += 1
                    continue
                tombstones.pop(path, None)
            srv.files[path] = local
            dev.index[path] = {"hash": local}
            up += 1
        elif local is None and remote is not None:
            tombstones.pop(path, None)
            dev.files[path] = remote
            dev.index[path] = {"hash": remote}
            down += 1
        else:
            tombstones.pop(path, None)
            if local != remote:
                conf += 1
                srv.files[path] = local
                dev.index[path] = {"hash": local}

    srv.deleted.clear()
    srv.deleted.update(tombstones)
    return {"up": up, "down": down, "del": dele, "conf": conf, "aborted": aborted}


def main():
    ok = True

    print("[S0 首次恢复] 本地空、服务器有 a,b,c")
    srv = Server({"a": 1, "b": 2, "c": 3})
    A = Dev({}, {})
    r = syncd(A, srv)
    print("    ", r, "| A.files=", A.files, "| server=", srv.files)
    if not (A.files == {"a": 1, "b": 2, "c": 3} and srv.files == {"a": 1, "b": 2, "c": 3} and r["del"] == 0):
        ok = False
        print("     FAIL")
    else:
        print("     OK 全量下载、未删任何东西")

    print("\n[S1 删除传播 A->服务器->B]")
    srv = Server({"a": 1, "b": 2})
    A = Dev({"a": 1, "b": 2}, {"a": 1, "b": 2})
    B = Dev({"a": 1, "b": 2}, {"a": 1, "b": 2})
    A.files.pop("a")
    r = syncd(A, srv)
    print("    A 同步:", r, "| server=", srv.files, "| 墓碑=", srv.deleted)
    if not (srv.files == {"b": 2} and "a" in srv.deleted):
        ok = False; print("     FAIL(A)")
    r = syncd(B, srv)
    print("    B 同步:", r, "| B.files=", B.files, "| server=", srv.files)
    if B.files != {"b": 2}:
        ok = False; print("     FAIL(B 未删除本地副本)")
    if srv.files != {"b": 2}:
        ok = False; print("     FAIL(复活了)")
    if B.files == {"b": 2} and srv.files == {"b": 2}:
        print("     OK 删除正确传播到 B，且没有复活")

    print("\n[S2 A 再同步，确认不复活]")
    r = syncd(A, srv)
    print("    ", r, "| A.files=", A.files, "| server=", srv.files)
    if not (A.files == {"b": 2} and srv.files == {"b": 2}):
        ok = False; print("     FAIL")
    else:
        print("     OK 未复活")

    print("\n[S3 删除后 B 重新创建 a]")
    B.files["a"] = 9
    r = syncd(B, srv)
    print("    B 同步:", r, "| server=", srv.files, "| 墓碑=", srv.deleted)
    if not (srv.files == {"a": 9, "b": 2} and "a" not in srv.deleted):
        ok = False; print("     FAIL(B 上传)")
    r = syncd(A, srv)
    print("    A 同步:", r, "| A.files=", A.files)
    if A.files != {"a": 9, "b": 2}:
        ok = False; print("     FAIL(A 未拉取)")
    if A.files == {"a": 9, "b": 2}:
        print("     OK 重新创建会同步传播（删除被撤销）")

    print("\n[S4 边界：远端被别的设备改过 -> 不允许删]")
    srv = Server({"a": 1})
    A = Dev({"a": 1}, {"a": 1})
    B = Dev({"a": 1}, {"a": 1})
    B.files["a"] = 2
    r = syncd(B, srv)
    print("    B 改并同步:", r, "| server=", srv.files)
    A.files.pop("a")
    r = syncd(A, srv)
    print("    A 删除后同步:", r, "| A.files=", A.files, "| server=", srv.files)
    if not (A.files.get("a") == 2 and srv.files.get("a") == 2):
        ok = False; print("     FAIL(误删了远端的新修改)")
    else:
        print("     OK 远端的新修改没有被误删（改为下载回来）")

    print("\n[S5 海量删除保护] 索引 200 个，本地删了 100 个")
    files = {"n%d" % i: i for i in range(200)}
    srv = Server(files)
    A = Dev(files, files)
    for i in range(100):
        A.files.pop("n%d" % i)
    r = syncd(A, srv)
    print("    ", r, "| 服务器剩余:", len(srv.files))
    if not (r["aborted"] and len(srv.files) == 200):
        ok = False; print("     FAIL(保护未生效)")
    else:
        print("     OK 批量删除被保护拦下（未误删）")

    print("\n结果:", "全部场景通过" if ok else "存在失败项")


main()
