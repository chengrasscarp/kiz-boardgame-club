#!/usr/bin/env python3
"""从 BGStatsExport.json 生成 js/data.js，按规则筛选数据。

筛选规则:
  - 仅保留茨坝人才公寓405 (locationRefId=1) 和茨坝104 (locationRefId=2) 的对局
  - 仅保留带有"研究生"标签 (tagRefId=3) 的玩家
  - 仅保留上述对局中出现的游戏
"""

import json
import os
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
INPUT_FILE = os.path.join(SCRIPT_DIR, "BGStatsExport.json")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "js", "data.js")

# 筛选参数
VALID_LOCATION_IDS = {1, 2}       # 茨坝405, 茨坝104
GRAD_STUDENT_TAG_ID = 3           # 研究生标签


def load_data():
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def filter_players(raw_players):
    """筛选带有'研究生'标签的玩家。"""
    players = []
    player_ids = set()

    for p in raw_players:
        tag_ids = {t["tagRefId"] for t in p.get("tags", [])}
        if GRAD_STUDENT_TAG_ID in tag_ids:
            players.append({
                "id": p["id"],
                "name": p["name"],
                "uuid": p["uuid"],
            })
            player_ids.add(p["id"])

    return players, player_ids


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
        })

    return plays


def filter_games(raw_games, used_game_ids):
    """只保留对局中实际出现的游戏。"""
    games = []
    for g in raw_games:
        if g["id"] not in used_game_ids:
            continue
        games.append({
            "id": g["id"],
            "name": g["name"],
            "bggId": g.get("bggId", 0),
            "bggName": g.get("bggName", ""),
            "minPlayers": g.get("minPlayerCount", 1),
            "maxPlayers": g.get("maxPlayerCount", 99),
            "minPlayTime": g.get("minPlayTime", 0),
            "maxPlayTime": g.get("maxPlayTime", 0),
            "designers": g.get("designers", ""),
            "urlImage": g.get("urlImage", ""),
            "urlThumb": g.get("urlThumb", ""),
            "isExpansion": g.get("isExpansion", 0),
            "copies": [{
                "gameName": c.get("gameName", g["name"]),
                "urlThumb": c.get("urlThumb", ""),
            } for c in g.get("copies", [])[:1]],
        })
    return games


def filter_locations(raw_locations):
    """只保留筛选后的地点。"""
    return [{
        "id": l["id"],
        "name": l["name"],
    } for l in raw_locations if l["id"] in VALID_LOCATION_IDS]


def compute_stats(plays, players, games):
    """计算常用统计数据。"""
    # 游玩次数 per game
    game_play_count = Counter(p["gameRefId"] for p in plays)
    top_games = [
        {"gameRefId": gid, "count": count}
        for gid, count in game_play_count.most_common(10)
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

    # 收集实际出现的游戏 ID
    used_game_ids = {p["gameRefId"] for p in plays}

    print("筛选游戏...")
    games = filter_games(data.get("games", []), used_game_ids)

    print("筛选地点...")
    locations = filter_locations(data.get("locations", []))

    print("计算统计数据...")
    stats = compute_stats(plays, players, games)

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
