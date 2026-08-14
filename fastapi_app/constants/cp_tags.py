from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class CPTagConfig:
    """Dedicated CP search strings for AO3, Taiwan indexes, and CxC."""

    ao3_query: str
    local_query: str
    cxc_query: str


MULTI_PLATFORM_CP_MAP: dict[str, CPTagConfig] = {
    "義忍": CPTagConfig(
        ao3_query='"Tomioka Giyuu/Kochou Shinobu" OR "義忍"',
        local_query="義忍 富岡義勇 胡蝶忍",
        cxc_query="義忍",
    ),
    "五夏": CPTagConfig(
        ao3_query='"Gojo Satoru/Geto Suguru" OR "五夏"',
        local_query="五夏 五條悟 夏油傑",
        cxc_query="五夏",
    ),
    "夏五": CPTagConfig(
        ao3_query='"Geto Suguru/Gojo Satoru" OR "夏五"',
        local_query="夏五 夏油傑 五條悟",
        cxc_query="夏五",
    ),
    "勝出": CPTagConfig(
        ao3_query='"Bakugou Katsuki/Midoriya Izuku" OR "勝出"',
        local_query="勝出 爆豪勝己 綠谷出久",
        cxc_query="勝出",
    ),
    "轟出": CPTagConfig(
        ao3_query='"Todoroki Shouto/Midoriya Izuku" OR "轟出"',
        local_query="轟出 轟焦凍 綠谷出久",
        cxc_query="轟出",
    ),
    "佐櫻": CPTagConfig(
        ao3_query='"Uchiha Sasuke/Haruno Sakura" OR "佐櫻"',
        local_query="佐櫻 宇智波佐助 春野櫻",
        cxc_query="佐櫻",
    ),
}


def get_keyword_for_platform(keyword: str, platform_type: Literal["ao3", "local", "cxc"]) -> str:
    """Translate a known CP alias or preserve a free-text search unchanged."""
    normalized_keyword = keyword.strip()
    config = MULTI_PLATFORM_CP_MAP.get(normalized_keyword)
    if config is None:
        return normalized_keyword
    if platform_type == "ao3":
        return config.ao3_query
    if platform_type == "cxc":
        return config.cxc_query
    return config.local_query


# Existing cache and relevance paths intentionally retain a lightweight AO3 map.
CP_TAG_MAP: dict[str, str] = {
    alias: config.ao3_query for alias, config in MULTI_PLATFORM_CP_MAP.items()
}

# 這些簡稱在 AO3 上容易受到繁簡字、舊 mapping 或暫時性上游防護影響。
# forceRefresh 時會清除同義 key 並略過舊快取讀取，再以成功的即時結果覆寫快取。
LIVE_ONLY_CP_ALIASES = frozenset((*CP_TAG_MAP.keys(), "义忍"))

# 同一組配對的繁簡別名需要一起被清除，避免任一舊 key 汙染即時搜尋診斷。
CP_CACHE_ALIASES: dict[str, frozenset[str]] = {
    "義忍": frozenset(("義忍", "义忍")),
    "义忍": frozenset(("義忍", "义忍")),
}
