#!/usr/bin/env python3
"""从 BGStatsExport.json 生成 js/data.js，按规则筛选数据。

筛选规则:
  - 线下地点：茨坝405(1)、茨坝104(2)、花园桌游小程序(8)、某人的家(10)、茨坝205(18)
  - 线上(BGA)：BoardGameArena(4)，仅保留含陈勇杰+至少另一研究生的对局，
    非研究生玩家显示为"歪果人"
  - 仅保留带有"研究生"标签 (tagRefId=3) 的玩家
  - 仅保留上述对局中出现的游戏
"""

import csv
import json
import os
from collections import Counter
from opencc import OpenCC

# 简繁转换（用于游戏名搜索时简繁通用匹配，预计算无需前端依赖）
_CC_S2T = OpenCC('s2t')  # 简 -> 繁
_CC_T2S = OpenCC('t2s')  # 繁 -> 简


def _name_variants(name):
    """返回游戏名的 (简体版, 繁体版)，供搜索时双向匹配。"""
    return _CC_T2S.convert(name), _CC_S2T.convert(name)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(SCRIPT_DIR, "BGStatsExport.json")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "js", "data.js")
COLLECTION_CSV = os.path.join(SCRIPT_DIR, "collection.csv")

# 筛选参数
VALID_LOCATION_IDS = {1, 2, 4, 8, 10, 18}  # 405, 104, BoardGameArena, 花园, 某人的家, 205
BGA_LOCATION_ID = 4                         # BoardGameArena
GRAD_STUDENT_TAG_ID = 3                     # 研究生标签
DEANONYMIZE_IDS = {1, 3, 4, 7, 17, 28}     # 保留真名: 陈勇杰、白如、梁能涛、朱晨阳、何林、王乐桐
CHEN_PLAYER_ID = 1                          # 陈勇杰

# 允许单人游玩的对局游戏（如单人破案/剧情游戏，虽仅1人但保留统计）
SOLO_ALLOWED_GAME_IDS = {6, 16, 18, 19}  # 罪案疑云系列

# 本地游戏封面覆盖：游戏名 -> 站点内相对路径。
LOCAL_GAME_IMAGES = {
    "三国杀：欢乐斗地主": "img/三国杀欢乐斗地主.jpg",
}


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

            def safe_int(v, default=0):
                try:
                    return int(v) if v else default
                except Exception:
                    return default

            def safe_float(v, default=0):
                try:
                    return float(v) if v else default
                except Exception:
                    return default

            bgg_info[oid] = {
                "bggRank": safe_int(row.get("rank"), None) or None,
                "bggRating": safe_float(row.get("average"), 0),
                "complexity": round(safe_float(row.get("avgweight"), 0), 1),
                "yearPublished": safe_int(row.get("yearpublished"), 0),
                "bestPlayers": row.get("bggbestplayers", ""),
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
            avatar_color = None
            bga_username = ""
            try:
                meta = json.loads(p.get("metaData", "{}"))
                bga_username = (meta.get("bgaUsername") or "").strip()
                if p["id"] == 1:
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
                "bgaUsername": bga_username,
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
            continue
        id_to_alias[player["id"]] = f"桌友{counter:02d}"
        counter += 1

    for player in players:
        if player["id"] not in DEANONYMIZE_IDS:
            player["name"] = id_to_alias[player["id"]]

    return id_to_alias


def filter_plays(raw_plays, player_ids):
    """筛选有效地点 + 研究生参与的对局。

    线下地点：普通筛选，仅保留至少1名研究生的对局。
    BGA 线上(id=4)：特殊处理——
      - 先检查筛选条件，通过后才创建歪果人
      - 必须包含陈勇杰(id=1) + 至少另1名研究生
      - 非研究生玩家替换为伪玩家"歪果人"
      - 标记 source='bga'
    返回: (plays, pseudo_players)
    """
    plays = []
    pseudo_players = []
    pseudo_next = [1]

    def get_pseudo_id():
        n = pseudo_next[0]
        pseudo_next[0] += 1
        pid = -n
        pseudo_players.append({"id": pid, "name": "歪果人", "bgaUsername": ""})
        return pid

    for p in raw_plays:
        lid = p.get("locationRefId")
        if lid not in VALID_LOCATION_IDS:
            continue

        is_bga = (lid == BGA_LOCATION_ID)

        # 第一步：统计已知研究生成员，判断是否通过筛选
        known_member_ids = set()
        for ps in p.get("playerScores", []):
            pid = ps.get("playerRefId")
            if pid in player_ids:
                known_member_ids.add(pid)

        if is_bga:
            if CHEN_PLAYER_ID not in known_member_ids:
                continue
            if len(known_member_ids) < 2:
                continue
        else:
            if not known_member_ids:
                continue

        # 第二步：通过筛选，构建 playerScores
        player_scores = []
        for ps in p.get("playerScores", []):
            pid = ps.get("playerRefId")
            if is_bga and pid not in player_ids:
                # BGA 对局中非研究生玩家 → 歪果人
                pseudo_pid = get_pseudo_id()
                player_scores.append({
                    "playerRefId": pseudo_pid,
                    "score": ps.get("score", ""),
                    "winner": ps.get("winner", False),
                    "rank": ps.get("rank", 0),
                })
            else:
                # 线下对局保留所有玩家，BGA 对局保留研究生玩家
                player_scores.append({
                    "playerRefId": pid,
                    "score": ps.get("score", ""),
                    "winner": ps.get("winner", False),
                    "rank": ps.get("rank", 0),
                })

        # 单人局过滤
        if len(player_scores) < 2 and p.get("gameRefId") not in SOLO_ALLOWED_GAME_IDS:
            continue

        play = {
            "uuid": p["uuid"],
            "gameRefId": p["gameRefId"],
            "locationRefId": lid,
            "playDateYmd": p["playDateYmd"],
            "playDate": p["playDate"],
            "durationMin": p.get("durationMin", 0),
            "scoringSetting": p.get("scoringSetting"),
            "board": p.get("board"),
            "comments": p.get("comments", ""),
            "playerScores": player_scores,
            "expansionPlays": [
                {"bggId": ep.get("bggId", 0), "gameRefId": ep.get("gameRefId")}
                for ep in (p.get("expansionPlays") or [])
            ],
        }
        if is_bga:
            play["source"] = "bga"

        plays.append(play)

    if pseudo_players:
        print(f"  BGA 伪玩家: {len(pseudo_players)} 个歪果人")

    return plays, pseudo_players


import re


def _copy_image(c):
    """返回副本的有效 BGG CDN 图片 URL（排除 previewthumb 预览图），否则空串。"""
    t = c.get("urlThumb", "") or c.get("urlImage", "")
    if not t or "cf.geekdo-images.com" not in t:
        return ""
    if "previewthumb" in t:
        return ""
    return t


def pick_primary_copy(copies):
    """挑选一款游戏的"主要拥有副本"。"""
    owned = [c for c in copies if c.get("statusOwned") == 1]
    pool = owned if owned else copies
    for c in pool:
        if _copy_image(c):
            return c
    return pool[0] if pool else None


def version_label(version_name, version_languages):
    """把 versionName + VersionLanguages 规范化成中文版本徽章文案。"""
    vn = version_name or ""
    langs = [x.strip() for x in (version_languages or "").split(",") if x.strip()]
    has_ch = ("Chinese" in langs) or ("Chinese" in vn)
    has_en = ("English" in langs) or ("English" in vn)
    if "Simplified" in vn or "Simplied" in vn:
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
    """保留所有拥有的游戏，附带游玩次数和 BGG 详细信息。"""
    games = []
    for g in raw_games:
        owned = any(c.get("statusOwned") == 1 for c in g.get("copies", []))
        if not owned:
            continue

        bgg_id = str(g.get("bggId", 0))
        bgg = bgg_collection.get(bgg_id, {})

        owned_thumb, owned_version_label = _owned_version_fields(g.get("copies", []))

        local_img = LOCAL_GAME_IMAGES.get(g["name"], "")
        thumb_url = local_img or g.get("urlThumb", "")

        games.append({
            "id": g["id"],
            "name": g["name"],
            "nameSim": _name_variants(g["name"])[0],
            "nameTrad": _name_variants(g["name"])[1],
            "bggId": g.get("bggId", 0),
            "bggName": g.get("bggName", ""),
            "rating": g.get("rating", 0),
            "minPlayers": g.get("minPlayerCount", 1),
            "maxPlayers": g.get("maxPlayerCount", 99),
            "minPlayTime": g.get("minPlayTime", 0),
            "maxPlayTime": g.get("maxPlayTime", 0),
            "designers": g.get("designers", ""),
            "urlImage": g.get("urlImage", ""),
            "urlThumb": thumb_url,
            "isExpansion": g.get("isExpansion", 0),
            "playCount": play_counts.get(g["id"], 0),
            "bggRank": bgg.get("bggRank"),
            "bggRating": bgg.get("bggRating", 0),
            "complexity": bgg.get("complexity", 0),
            "yearPublished": bgg.get("yearPublished", 0),
            "bestPlayers": bgg.get("bestPlayers", ""),
            "copies": [{
                "gameName": c.get("gameName", g["name"]),
                "urlThumb": c.get("urlThumb", ""),
            } for c in g.get("copies", [])[:1]],
            "ownedThumb": owned_thumb,
            "ownedVersionLabel": owned_version_label,
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
        for ep in p.get("expansionPlays", []):
            counts[ep["gameRefId"]] += 1
    return counts


def compute_stats(plays, players, games, play_counts):
    """计算常用统计数据。"""
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

    player_play_count = Counter()
    for p in plays:
        for ps in p["playerScores"]:
            player_play_count[ps["playerRefId"]] += 1

    top_players = [
        {"playerRefId": pid, "count": count}
        for pid, count in player_play_count.most_common(10)
    ]

    return {
        "totalPlays": len(plays),
        "totalPlayers": len(players),
        "totalGames": len(games),
        "avgPlaysPerGame": round(len(plays) / len(games), 1) if games else 0,
        "avgPlaysPerPlayer": round(len(plays) / len(players), 1) if players else 0,
        "topGames": top_games,
        "topPlayers": top_players,
    }


def compute_record_holders(plays, games, player_id_to_name, no_points_map):
    """为每款"需要记分"的游戏计算最佳单局分数保持者，回填 recordHolder。"""
    by_game = {}
    for p in plays:
        gid = p["gameRefId"]
        board = p.get("board") or ""
        if "双人版图" in board:
            continue
        lower_better = (p.get("scoringSetting") == 2)
        for ps in p.get("playerScores", []):
            raw = ps.get("score")
            if raw in (None, ""):
                continue
            try:
                val = float(raw)
            except (TypeError, ValueError):
                continue
            if val == 0 and not lower_better:
                continue
            by_game.setdefault(gid, []).append(
                (val, ps.get("playerRefId"), p.get("playDateYmd", ""), lower_better)
            )

    for g in games:
        gid = g["id"]
        if no_points_map.get(gid, False):
            g["recordHolder"] = None
            continue
        recs = by_game.get(gid)
        if not recs:
            g["recordHolder"] = None
            continue
        lower_better = recs[0][3]
        if lower_better:
            best_val = min(r[0] for r in recs)
        else:
            best_val = max(r[0] for r in recs)
        holders = [r for r in recs if r[0] == best_val]
        holders.sort(key=lambda r: -int(r[2]) if str(r[2]).isdigit() else 0)
        seen = set()
        deduped = []
        for r in holders:
            if r[1] in seen:
                continue
            seen.add(r[1])
            deduped.append(r)
        holders = deduped
        # 跳过歪果人等伪玩家
        holders = [r for r in holders if r[1] in player_id_to_name]
        if not holders:
            g["recordHolder"] = None
            continue
        names = [player_id_to_name.get(r[1], "未知玩家") for r in holders]
        dates = [str(r[2]) for r in holders]
        score_disp = str(int(best_val)) if best_val == int(best_val) else str(best_val)
        g["recordHolder"] = {
            "names": names,
            "score": score_disp,
            "dates": dates,
            "lowerBetter": lower_better,
        }


def main():
    print(f"读取 {INPUT_FILE} ...")
    data = load_data()

    print("筛选玩家（研究生）...")
    players, player_ids = filter_players(data.get("players", []))

    print("筛选对局（含线上 BGA 按规则过滤）...")
    plays, pseudo_players = filter_plays(data.get("plays", []), player_ids)

    print("计算游玩次数（含扩展）...")
    play_counts = compute_play_counts(plays)
    print("计算本体游玩次数...")
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

    print("计算各游戏的记分记录保持者...")
    player_id_to_name = {p["id"]: p["name"] for p in players}
    no_points_map = {g["id"]: bool(g.get("noPoints")) for g in data.get("games", [])}
    compute_record_holders(plays, games, player_id_to_name, no_points_map)

    print(f"\n=== 筛选结果 ===")
    print(f"  玩家: {len(players)} 人")
    bga_count = sum(1 for p in plays if p.get("source") == "bga")
    print(f"  对局: {len(plays)} 场（其中 BGA 线上 {bga_count} 场）")
    print(f"  游戏: {len(games)} 款")
    print(f"  地点: {len(locations)} 个")

    output = {
        "players": players,
        "plays": plays,
        "games": games,
        "locations": locations,
        "stats": stats,
        "pseudoPlayers": pseudo_players,
    }

    json_str = json.dumps(output, ensure_ascii=False, indent=2)
    js_content = f"// Auto-generated by generate_data.py. DO NOT EDIT.\nwindow.KIZ_DATA = {json_str};\n"

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"\n已生成 {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
