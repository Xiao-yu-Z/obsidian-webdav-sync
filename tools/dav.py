#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
dav.py — 与自建 WebDAV 服务器对话的最小工具（仅标准库）

用途：维护/救援（列目录、读索引、下载、上传、移动、删除、创建目录）。
不参与插件运行，插件本身不依赖本文件。

用法示例：
  python dav.py ls                 # 递归列出远端全部文件
  python dav.py ls <dir>           # 列出某目录（Depth 1）
  python dav.py get <路径> <本地文件>
  python dav.py put <路径> <本地文件>
  python dav.py mkcol <路径>
  python dav.py move <源> <目标>
  python dav.py rm <路径>
  python dav.py head <路径>
"""
import sys
import os
import ssl
import json
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

# 凭据来源（按优先级）：
#   1) 环境变量 DAV_URL / DAV_USER / DAV_PASS
#   2) 环境变量 DAV_DATA 指向的插件 data.json
#   3) 当前目录下的 data.json
#   4) 当前目录为库根时的 .obsidian/plugins/obsidian-webdav-sync/data.json
# 本文件不硬编码任何地址/账号/密码，可安全提交与分享。
def _data_candidates():
    out = []
    if os.environ.get("DAV_DATA"):
        out.append(os.environ["DAV_DATA"])
    out.append(os.path.join(os.getcwd(), "data.json"))
    out.append(os.path.join(os.getcwd(), ".obsidian", "plugins",
                            "obsidian-webdav-sync", "data.json"))
    return out


def _load_credentials():
    url = os.environ.get("DAV_URL")
    user = os.environ.get("DAV_USER")
    pwd = os.environ.get("DAV_PASS")
    if url and user and pwd:
        return url, user, pwd
    for path in _data_candidates():
        try:
            s = json.load(open(path, encoding="utf-8"))["settings"]
            if s.get("serverUrl") and s.get("username") and s.get("password"):
                return s["serverUrl"], s["username"], s["password"]
        except Exception:
            continue
    raise SystemExit(
        "未能取得服务器凭据。任选一种方式：\n"
        "  1) 设置环境变量 DAV_URL / DAV_USER / DAV_PASS；\n"
        "  2) 设置 DAV_DATA 指向插件 data.json；\n"
        "  3) 在库根目录运行本脚本（自动读取 "
        ".obsidian/plugins/obsidian-webdav-sync/data.json，其中需勾选「记住密码」）。"
    )


BASE, USER, PASS = _load_credentials()
if not BASE.endswith("/"):
    BASE += "/"

SSLCTX = ssl.create_default_context()
SSLCTX.check_hostname = False
SSLCTX.verify_mode = ssl.CERT_NONE


def _auth_header():
    import base64
    raw = f"{USER}:{PASS}".encode("utf-8")
    return "Basic " + base64.b64encode(raw).decode("ascii")


def enc(rel_path: str) -> str:
    """对每个路径分段做 URL 编码，保留斜杠"""
    return "/".join(
        urllib.parse.quote(seg, safe="") for seg in rel_path.split("/")
    )


def url_of(rel_path: str) -> str:
    if rel_path == "":
        return BASE
    return BASE + enc(rel_path)


def request(method, rel_path, data=None, headers=None, timeout=120):
    hdrs = {"Authorization": _auth_header()}
    if headers:
        hdrs.update(headers)
    req = urllib.request.Request(url_of(rel_path), data=data, method=method)
    for k, v in hdrs.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, context=SSLCTX, timeout=timeout) as r:
            body = r.read()
            return r.status, dict(r.headers), body
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def propfind(rel_path, depth="1"):
    body = (
        b'<?xml version="1.0" encoding="utf-8"?>'
        b'<D:propfind xmlns:D="DAV:"><D:prop>'
        b"<D:resourcetype/><D:getcontentlength/><D:getlastmodified/>"
        b"<D:getetag/></D:prop></D:propfind>"
    )
    st, hd, raw = request(
        "PROPFIND",
        rel_path,
        data=body,
        headers={"Depth": depth, "Content-Type": "application/xml"},
    )
    if st not in (207, 200):
        raise RuntimeError(f"PROPFIND {rel_path} -> {st}")

    def strip(tag):
        return tag.split("}", 1)[1] if "}" in tag else tag

    root = ET.fromstring(raw)
    out = []
    for resp in root:
        if strip(resp.tag) != "response":
            continue
        href = ""
        is_dir = False
        size = 0
        mtime = ""
        for child in resp:
            t = strip(child.tag)
            if t == "href":
                href = child.text or ""
            elif t == "propstat":
                for pc in child:
                    if strip(pc.tag) != "prop":
                        continue
                    for p in pc:
                        pt = strip(p.tag)
                        if pt == "resourcetype":
                            for sub in p:
                                if strip(sub.tag) == "collection":
                                    is_dir = True
                        elif pt == "getcontentlength":
                            size = int(p.text or 0)
                        elif pt == "getlastmodified":
                            mtime = p.text or ""
        # href 是绝对路径形式 /<账号>/... 或完整 URL
        path = urllib.parse.unquote(href)
        if path.startswith(BASE):
            path = path[len(BASE):]
        elif path.startswith("http"):
            path = urllib.parse.urlparse(path).path
        path = path.lstrip("/")
        # 去掉账号前缀目录（如 <账号>/）
        if "/" in path and not path.startswith("_") and path.split("/")[0] == USER:
            path = path.split("/", 1)[1]
        out.append({"path": path, "dir": is_dir, "size": size, "mtime": mtime})
    return out


def list_recursive():
    """递归列出全部文件（跳过 _obsidian_webdav_sync* 元数据目录）"""
    files = []
    dirs_done = set()

    def walk(d):
        if d in dirs_done:
            return
        dirs_done.add(d)
        entries = propfind(d, "1")
        subs = []
        for e in entries:
            p = e["path"].rstrip("/")
            if p == d.rstrip("/") or p == "":
                continue
            if e["dir"]:
                if p.startswith("_obsidian_webdav_sync"):
                    continue
                subs.append(p)
            else:
                files.append(p)
        if subs:
            with ThreadPoolExecutor(max_workers=8) as ex:
                list(ex.map(walk, subs))

    walk("")
    return files


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd = sys.argv[1]
    if cmd == "ls":
        if len(sys.argv) > 2:
            for e in propfind(sys.argv[2], "1"):
                print(("D " if e["dir"] else "F ") + e["path"])
        else:
            files = list_recursive()
            print(json.dumps(files, ensure_ascii=False, indent=0))
            print(f"# {len(files)} files", file=sys.stderr)
    elif cmd == "get":
        st, hd, body = request("GET", sys.argv[2])
        open(sys.argv[3], "wb").write(body)
        print(st, len(body))
    elif cmd == "put":
        data = open(sys.argv[3], "rb").read()
        st, hd, body = request("PUT", sys.argv[2], data=data)
        print(st, hd.get("ETag"))
    elif cmd == "mkcol":
        st, hd, body = request("MKCOL", sys.argv[2])
        print(st)
    elif cmd == "move":
        dest = BASE + enc(sys.argv[3])
        st, hd, body = request(
            "MOVE", sys.argv[2], headers={"Destination": dest, "Overwrite": "F"}
        )
        print(st)
    elif cmd == "rm":
        p = sys.argv[2]
        hdrs = {"Depth": "infinity"} if p.endswith("/") else {}
        st, hd, body = request("DELETE", p, headers=hdrs)
        print(st)
    elif cmd == "head":
        st, hd, body = request("HEAD", sys.argv[2])
        print(st, hd.get("ETag"), hd.get("Content-Length"))
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
