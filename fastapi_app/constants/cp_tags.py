CP_TAG_MAP: dict[str, str] = {
    "義忍": '"Tomioka Giyuu/Kochou Shinobu" OR "義忍" OR ("Tomioka Giyuu" AND "Kochou Shinobu")',
    "五夏": '"Gojo Satoru/Geto Suguru" OR "五夏" OR ("Gojo Satoru" AND "Geto Suguru")',
    "夏五": '"Geto Suguru/Gojo Satoru" OR "夏五" OR ("Geto Suguru" AND "Gojo Satoru")',
    "勝出": '"Bakugou Katsuki/Midoriya Izuku" OR "勝出" OR ("Bakugou Katsuki" AND "Midoriya Izuku")',
    "轟出": '"Todoroki Shouto/Midoriya Izuku" OR "轟出" OR ("Todoroki Shouto" AND "Midoriya Izuku")',
}

# 這些簡稱在 AO3 上容易受到繁簡字、舊 mapping 或暫時性上游防護影響。
# forceRefresh 時會清除同義 key 並略過舊快取讀取，再以成功的即時結果覆寫快取。
LIVE_ONLY_CP_ALIASES = frozenset((*CP_TAG_MAP.keys(), "义忍"))

# 同一組配對的繁簡別名需要一起被清除，避免任一舊 key 汙染即時搜尋診斷。
CP_CACHE_ALIASES: dict[str, frozenset[str]] = {
    "義忍": frozenset(("義忍", "义忍")),
    "义忍": frozenset(("義忍", "义忍")),
}
