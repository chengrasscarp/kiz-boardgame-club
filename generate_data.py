#!/usr/bin/env python3
"""从 BGStatsExport.json 生成 js/data.js，按规则筛选数据。

筛选规则:
  - 仅保留茨坝人才公寓405 (locationRefId=1) 和茨坝104 (locationRefId=2) 的对局
  - 仅保留带有"研究生"标签 (tagRefId=3) 的玩家
  - 仅保留上述对局中出现的游戏
"""

import csv
import json
import os
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(SCRIPT_DIR, "BGStatsExport.json")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "js", "data.js")
COLLECTION_CSV = os.path.join(SCRIPT_DIR, "collection.csv")

# 筛选参数
VALID_LOCATION_IDS = {1, 2, 18}    # 茨坝405, 茨坝104, 茨坝205
GRAD_STUDENT_TAG_ID = 3           # 研究生标签
DEANONYMIZE_IDS = {1, 3, 4, 7, 28}   # 保留真名: 陈勇杰、白如、梁能涛、朱晨阳、王乐桐


def load_data():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def load_bgg_collection():
    """从 BGG 导出的 collection.csv 加载游戏详细信息。
    返回 dict: bgg_id (str) -> info dict
    """
    if not os.path.exists(COLLECTION_CSV):
        print("未找到 collection.csv，跳过 BGG 详细信息")
        return {}

    bgg_info = {}
    with open(COLLECTION_CSV, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            oid = row.get("objectid", "")
            if not oid:
                continue

            # 安全解析数字
            def safe_int(v, default=0):
                try: return int(v) if v else default
                except: return default

            def safe_float(v, default=0):
                try: return float(v) if v else default
                except: return default

            bgg_info[oid] = {
                "bggRank": safe_int(row.get("rank"), None) or None,
                "bggRating": safe_float(row.get("average"), 0),
                "complexity": round(safe_float(row.get("avgweight"), 0), 1),
                "yearPublished": safe_int(row.get("yearpublished"), 0),
                "bestPlayers": row.get("bggbestplayers", ""),
                "playingTime": safe_int(row.get("playingtime"), 0),
                "minPlayers": safe_int(row.get("minplayers"), 0),
                "maxPlayers": safe_int(row.get("maxplayers"), 0),
                "languageDependence": row.get("bgglanguagedependence", ""),
                "numOwned": safe_int(row.get("numowned"), 0),
                "acquiredFrom": row.get("acquiredfrom", ""),
                "pricePaid": row.get("pricepaid", ""),
                "versionNickname": row.get("version_nickname", ""),
            }

    print(f"加载 BGG 收藏: {len(bgg_info)} 款游戏")
    return bgg_info


def filter_players(raw_players):
    """筛选带有'研究生'标签的玩家。"""
    players = []
    player_ids = set()

    for p in raw_players:
        tag_ids = {t["tagRefId"] for t in p.get("tags", [])}
        if GRAD_STUDENT_TAG_ID in tag_ids:
            # Only keep avatar color for specific players
            # 桌友05 = 陈勇杰 (photo loaded from img/, color as fallback)
            avatar_color = None
            if p["id"] == 1:  # 陈勇杰
                try:
                    meta = json.loads(p.get("metaData", "{}"))
                    avatar = meta.get("playerAvatar")
                    if avatar and avatar.get("color"):
                        h, s, b = avatar["color"]
                        avatar_color = f"hsl({int(h*360)},{int(s*100)}%,{int(b*80)}%)"
                except (json.JSONDecodeError, KeyError, ValueError):
                    pass

            players.append({
                "id": p["id"],
                "name": p["name"],
                "uuid": p["uuid"],
                "avatarColor": avatar_color,
            })
            player_ids.add(p["id"])

    return players, player_ids


def anonymize_players(players):
    """按真实姓名拼音顺序排序后分配匿名代号。白名单玩家保留真名。"""
    from pypinyin import lazy_pinyin
    sorted_players = sorted(players, key=lambda x: lazy_pinyin(x["name"]))

    counter = 1
    id_to_alias = {}
    for player in sorted_players:
        if player["id"] in DEANONYMIZE_IDS:
            continue  # 保留真名，不占编号
        id_to_alias[player["id"]] = f"桌友{counter:02d}"
        counter += 1

    for player in players:
        if player["id"] not in DEANONYMIZE_IDS:
            player["name"] = id_to_alias[player["id"]]

    return id_to_alias


def filter_plays(raw_plays, player_ids):
    """筛选线下地点 + 研究生参与的对局。

    只保留至少有一名研究生参与的对局。
    """
    plays = []

    for p in raw_plays:
        if p.get("locationRefId") not in VALID_LOCATION_IDS:
            continue

        player_scores = []
        has_grad = False
        for ps in p.get("playerScores", []):
            pid = ps.get("playerRefId")
            if pid in player_ids:
                has_grad = True
            player_scores.append({
                "playerRefId": pid,
                "score": ps.get("score", ""),
                "winner": ps.get("winner", False),
                "rank": ps.get("rank", 0),
            })

        if not has_grad:
            continue

        plays.append({
            "uuid": p["uuid"],
            "gameRefId": p["gameRefId"],
            "locationRefId": p["locationRefId"],
            "playDateYmd": p["playDateYmd"],
            "playDate": p["playDate"],
            "durationMin": p.get("durationMin", 0),
            "playerScores": player_scores,
            # 透传扩展引用，供 compute_play_counts 统计扩展游玩次数
            "expansionPlays": [
                {"bggId": ep.get("bggId", 0), "gameRefId": ep.get("gameRefId")}
                for ep in (p.get("expansionPlays") or [])
            ],
        })

    return plays


import re


def _copy_image(c):
    """返回副本的有效 BGG CDN 图片 URL，否则空串。"""
    t = c.get("urlThumb", "") or c.get("urlImage", "")
    return t if (t and "cf.geekdo-images.com" in t) else ""


def pick_primary_copy(copies):
    """挑选一款游戏的"主要拥有副本"：优先 statusOwned 且带有效图片者，
    其次任意拥有副本，最后回退到第一份副本。"""
    owned = [c for c in copies if c.get("statusOwned") == 1]
    pool = owned if owned else copies
    for c in pool:
        if _copy_image(c):
            return c
    return pool[0] if pool else None


def version_label(version_name, version_languages):
    """把 versionName + VersionLanguages 规范化成中文版本徽章文案。
    简繁只有在 versionName 明确写了 Simplified/Traditional 时才能确定。"""
    vn = version_name or ""
    langs = [x.strip() for x in (version_languages or "").split(",") if x.strip()]
    has_ch = ("Chinese" in langs) or ("Chinese" in vn)
    has_en = ("English" in langs) or ("English" in vn)
    if "Simplified" in vn or "Simplied" in vn:  # 兼容导出里的拼写笔误
        return "简体中文版"
    if "Traditional" in vn:
        return "繁体中文版"
    if has_ch and has_en and len(langs) == 2:
        return "中英双语版"
    if has_ch and len(langs) > 1:
        return "多语言版(含中文)"
    if has_ch:
        return "中文版"
    if has_en and not has_ch:
        return "英文版"
    if langs:
        return "多语言版"
    return ""


def _owned_version_fields(copies):
    """返回 (ownedThumb, ownedVersionLabel)。"""
    primary = pick_primary_copy(copies)
    if not primary:
        return "", ""
    owned_thumb = _copy_image(primary)
    vl = ""
    m = re.search(r'"VersionLanguages":"([^"]*)"', primary.get("metaData", ""))
    if m:
        vl = m.group(1)
    return owned_thumb, version_label(primary.get("versionName", ""), vl)


def filter_games(raw_games, play_counts, bgg_collection, base_play_counts):
    """保留所有拥有的游戏，附带游玩次数和 BGG 详细信息。

    base_play_counts: 仅按本体(gameRefId)统计的游玩次数，用于标记
    playedStandalone（该扩展是否也作为本体被单独开过局）。
    """

    games = []
    for g in raw_games:
        owned = any(
            c.get("statusOwned") == 1
            for c in g.get("copies", [])
        )
        if not owned:
            continue

        bgg_id = str(g.get("bggId", 0))
        bgg = bgg_collection.get(bgg_id, {})

        owned_thumb, owned_version_label = _owned_version_fields(g.get("copies", []))

        # 用 CSV 中的玩家数/时长覆盖 BGStats 数据（更准确）
        min_p = bgg.get("minPlayers") or g.get("minPlayerCount", 1)
        max_p = bgg.get("maxPlayers") or g.get("maxPlayerCount", 99)
        play_time = bgg.get("playingTime") or g.get("minPlayTime", 0)

        games.append({
            "id": g["id"],
            "name": g["name"],
            "bggId": g.get("bggId", 0),
            "bggName": g.get("bggName", ""),
            "rating": g.get("rating", 0),
            "minPlayers": min_p,
            "maxPlayers": max_p,
            "minPlayTime": play_time,
            "maxPlayTime": g.get("maxPlayTime", 0) or play_time,
            "designers": g.get("designers", ""),
            "urlImage": g.get("urlImage", ""),
            "urlThumb": g.get("urlThumb", ""),
            "isExpansion": g.get("isExpansion", 0),
            "playCount": play_counts.get(g["id"], 0),
            # BGG 收藏信息
            "bggRank": bgg.get("bggRank"),
            "bggRating": bgg.get("bggRating", 0),
            "complexity": bgg.get("complexity", 0),
            "yearPublished": bgg.get("yearPublished", 0),
            "bestPlayers": bgg.get("bestPlayers", ""),
            "languageDependence": bgg.get("languageDependence", ""),
            "acquiredFrom": bgg.get("acquiredFrom", ""),
            "versionNickname": bgg.get("versionNickname", ""),
            "minPlayers": g.get("minPlayerCount", 1),
            "maxPlayers": g.get("maxPlayerCount", 99),
            "minPlayTime": g.get("minPlayTime", 0),
            "maxPlayTime": g.get("maxPlayTime", 0),
            "designers": g.get("designers", ""),
            "urlImage": g.get("urlImage", ""),
            "urlThumb": g.get("urlThumb", ""),
            "isExpansion": g.get("isExpansion", 0),
            "playCount": play_counts.get(g["id"], 0),
            "copies": [{
                "gameName": c.get("gameName", g["name"]),
                "urlThumb": c.get("urlThumb", ""),
            } for c in g.get("copies", [])[:1]],
            # 版本专属封面（主要拥有副本的图）+ 规范化版本徽章文案
            "ownedThumb": owned_thumb,
            "ownedVersionLabel": owned_version_label,
            # 该游戏是否作为本体被单独开过局（用于区分"既是本体又是扩展"与"纯扩展"）
            "playedStandalone": base_play_counts.get(g["id"], 0) > 0,
        })
    return games


def filter_locations(raw_locations):
    """只保留筛选后的地点。"""
    return [{
        "id": l["id"],
        "name": l["name"],
    } for l in raw_locations if l["id"] in VALID_LOCATION_IDS]


def compute_play_counts(plays):
    """计算每款游戏的总游玩次数，含扩展游玩。"""
    counts = Counter()
    for p in plays:
        counts[p["gameRefId"]] += 1
        # 扩展游玩也计入
        for ep in p.get("expansionPlays", []):
            counts[ep["gameRefId"]] += 1
    return counts


def compute_stats(plays, players, games, play_counts):
    """计算常用统计数据。"""
    # topGames 只统计拥有的游戏，且排除"纯扩展"（从未作为本体开过局的扩展）
    owned_ids = {g["id"] for g in games}
    base_counts = Counter(p["gameRefId"] for p in plays)
    pure_expansion_ids = {
        g["id"] for g in games
        if g.get("isExpansion") and base_counts.get(g["id"], 0) == 0
    }
    owned_play_counts = Counter({
        gid: c for gid, c in play_counts.items()
        if gid in owned_ids and gid not in pure_expansion_ids
    })
    top_games = [
        {"gameRefId": gid, "count": count}
        for gid, count in owned_play_counts.most_common(10)
    ]

    # 游玩次数 per player
    player_play_count = Counter()
    for p in plays:
        for ps in p["playerScores"]:
            player_play_count[ps["playerRefId"]] += 1

    top_players = [
        {"playerRefId": pid, "count": count}
        for pid, count in player_play_count.most_common(10)
    ]

    total_plays = len(plays)
    total_players = len(players)
    total_games = len(games)

    return {
        "totalPlays": total_plays,
        "totalPlayers": total_players,
        "totalGames": total_games,
        "avgPlaysPerGame": round(total_plays / total_games, 1) if total_games else 0,
        "avgPlaysPerPlayer": round(total_plays / total_players, 1) if total_players else 0,
        "topGames": top_games,
        "topPlayers": top_players,
    }


def main():
    print(f"读取 {INPUT_FILE} ...")
    data = load_data()

    print("筛选玩家（研究生）...")
    players, player_ids = filter_players(data.get("players", []))

    print("筛选对局（茨坝405+104，研究生参与）...")
    plays = filter_plays(data.get("plays", []), player_ids)

    print("计算游玩次数（含扩展）...")
    play_counts = compute_play_counts(plays)
    print("计算本体游玩次数（仅 gameRefId，用于标记 playedStandalone）...")
    base_play_counts = Counter(p["gameRefId"] for p in plays)

    print("加载 BGG 收藏信息...")
    bgg_collection = load_bgg_collection()

    print("筛选游戏...")
    games = filter_games(data.get("games", []), play_counts, bgg_collection, base_play_counts)

    print("筛选地点...")
    locations = filter_locations(data.get("locations", []))

    print("匿名化玩家名称...")
    id_to_alias = anonymize_players(players)

    print("计算统计数据...")
    stats = compute_stats(plays, players, games, play_counts)

    print(f"\n=== 筛选结果 ===")
    print(f"  玩家: {len(players)} 人")
    print(f"  对局: {len(plays)} 场")
    print(f"  游戏: {len(games)} 款")
    print(f"  地点: {len(locations)} 个")

    # 构建输出对象
    output = {
        "players": players,
        "plays": plays,
        "games": games,
        "locations": locations,
        "stats": stats,
    }

    # 写入 data.js
    json_str = json.dumps(output, ensure_ascii=False, indent=2)
    js_content = f"// Auto-generated by generate_data.py. DO NOT EDIT.\nwindow.KIZ_DATA = {json_str};\n"

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n已生成 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
