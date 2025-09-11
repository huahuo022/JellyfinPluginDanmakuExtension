from __future__ import annotations
import re
from pathlib import Path
import typing as t

import httpx

# 端点常量
BILIBILI_VIEW_API = "https://api.bilibili.com/x/web-interface/view"
BILIBILI_DM_XML_API = "https://api.bilibili.com/x/v1/dm/list.so"
BILIBILI_SEASON_API = "https://api.bilibili.com/pgc/view/web/season"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

class DanmakuFetchError(Exception):
    """获取弹幕或视频信息失败。"""

# URL 匹配
URL_PATTERNS = {
    # 匹配优先级：先 ep、再 ss、后 bv
    "ep": re.compile(r"/bangumi/play/ep(\d+)"),
    "ss": re.compile(r"/bangumi/play/ss(\d+)"),
    "bv": re.compile(r"/video/(BV[0-9A-Za-z]{10})"),
}

# --- 内部工具 ---

def _owned_client(client: httpx.Client | None) -> tuple[httpx.Client, bool]:
    if client is not None:
        return client, False
    c = httpx.Client(headers={
        "User-Agent": USER_AGENT,
        "Referer": "https://www.bilibili.com",
    })
    return c, True


def _api_get(client: httpx.Client, url: str, params: dict, *, expect_json: bool = True) -> dict:
    resp = client.get(url, params=params, timeout=15)
    if resp.status_code != 200:
        raise DanmakuFetchError(f"请求失败: {url} HTTP {resp.status_code}")
    if not expect_json:
        # 仅返回原始响应
        return {"_raw": resp}
    data = resp.json()
    code = data.get("code")
    if code != 0:
        raise DanmakuFetchError(f"接口错误: {code} - {data.get('message')}")
    return data.get("data") or data.get("result") or {}


# --- 对外函数 1: URL -> CID ---

def resolve_cid_from_url(page_url: str, *, season_episode_index: int = 1, client: httpx.Client | None = None) -> int:
    """
    识别传入 URL 的类型（bv/ep/ss），并获取对应 cid。
    - 普通视频 BV：取第 1P 的 cid
    - 番剧 ep：根据 ep_id 精确匹配
    - 番剧 ss：取第 season_episode_index 集的 cid（1 基）
    """
    s = (page_url or "").strip()
    if not s:
        raise ValueError("URL 不能为空")
    if not (s.startswith("http://") or s.startswith("https://")):
        raise ValueError("需要传入完整 URL（含 http/https）")

    kind: str | None = None
    ident: str | None = None
    # 匹配顺序：ep -> ss -> bv
    for k, pat in URL_PATTERNS.items():
        m = pat.search(s)
        if m:
            kind = k
            ident = m.group(1) if k != "bv" else m.group(1)  # ep/ss 是数字，bv 是完整BV号
            break

    if not kind or not ident:
        raise ValueError("无法从该 URL 解析出 BV/EP/SS 标识")

    cli, owned = _owned_client(client)
    try:
        if kind == "bv":
            data = _api_get(cli, BILIBILI_VIEW_API, {"bvid": ident})
            pages = data.get("pages") or []
            if not pages:
                raise DanmakuFetchError("视频无分P信息")
            cid = pages[0].get("cid")
            if not cid:
                raise DanmakuFetchError("未获取到 cid")
            return int(cid)

        if kind == "ep":
            ep_id = int(ident)
            season = _api_get(cli, BILIBILI_SEASON_API, {"ep_id": ep_id})
            episodes = season.get("episodes") or []
            for ep in episodes:
                if int(ep.get("id", -1)) == ep_id:
                    cid = ep.get("cid")
                    if not cid:
                        raise DanmakuFetchError("该 ep 未找到 cid")
                    return int(cid)
            raise DanmakuFetchError(f"在番剧列表中未找到 ep_id={ep_id}")

        if kind == "ss":
            season_id = int(ident)
            season = _api_get(cli, BILIBILI_SEASON_API, {"season_id": season_id})
            episodes = season.get("episodes") or []
            if not episodes:
                raise DanmakuFetchError("该 season 无 episodes")
            idx = season_episode_index
            if idx < 1 or idx > len(episodes):
                raise DanmakuFetchError(f"season_episode_index 超出范围 1..{len(episodes)} (给定 {idx})")
            ep = episodes[idx - 1]
            cid = ep.get("cid")
            if not cid:
                raise DanmakuFetchError("选择的集无 cid")
            return int(cid)

        raise DanmakuFetchError(f"未知类型: {kind}")
    finally:
        if owned:
            cli.close()


# --- 对外函数 2: CID -> 下载XML ---

def download_danmaku_xml_by_cid(
    cid: int,
    output: t.Union[str, Path, None] = None,
    *,
    overwrite: bool = True,
    client: httpx.Client | None = None,
) -> Path:
    """
    传入 cid，下载弹幕 XML 并保存到本地。
    - output 为 None 时，默认保存为 ./danmaku_{cid}.xml
    - output 为目录时，保存为 <目录>/danmaku_{cid}.xml
    - output 为以 .xml 结尾的文件路径时，直接使用该路径
    - 当文件已存在且 overwrite=False 时，直接返回该路径
    """
    cli, owned = _owned_client(client)
    try:
        resp = cli.get(BILIBILI_DM_XML_API, params={"oid": int(cid)}, timeout=20)
        if resp.status_code != 200:
            raise DanmakuFetchError(f"获取弹幕 XML 失败 HTTP {resp.status_code}")
        xml_bytes = resp.content

        # 解析输出路径
        def _default_name() -> str:
            return f"danmaku_{int(cid)}.xml"

        if output is None:
            out_path = Path(_default_name())
        else:
            p = Path(output)
            if p.exists() and p.is_dir():
                out_path = p / _default_name()
            elif p.suffix.lower() == ".xml":
                out_path = p
            elif not p.exists() and p.suffix == "":
                out_path = p / _default_name()
            else:
                out_path = p

        if out_path.exists() and not overwrite:
            return out_path

        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(xml_bytes)
        return out_path
    finally:
        if owned:
            cli.close()


__all__ = [
    "DanmakuFetchError",
    "resolve_cid_from_url",
    "download_danmaku_xml_by_cid",
]
