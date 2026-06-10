#!/usr/bin/env python3
"""抓取所有拥有游戏的 BGG 排名，保存到 bgg_ranks.json。
在能访问 boardgamegeek.com 的机器上运行（如本地 Windows）。
"""

import json
import re
import time
import urllib.request
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_FILE = os.path.join(SCRIPT_DIR, "BGStatsExport.json")
OUTPUT_FILE = os.path.join(SCRIPT_DIR, "bgg_ranks.json")

BGG_PAGE = "https://boardgamegeek.com/boardgame/{}"


def get_owned_game_ids():
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    ids = set()
    for g in data["games"]:
        bgg_id = g.get("bggId", 0)
        if not bgg_id:
            continue
        has_owned = any(c.get("statusOwned") == 1 for c in g.get("copies", []))
        if has_owned:
            ids.add(bgg_id)

    return sorted(ids)


def fetch_ranks(bgg_ids):
    ranks = {}
    total = len(bgg_ids)

    for i, bgg_id in enumerate(bgg_ids, 1):
        url = BGG_PAGE.format(bgg_id)
        print(f"[{i}/{total}] BGG {bgg_id}...", end=" ", flush=True)

        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                html = resp.read().decode("utf-8", errors="ignore")

            # Look for "Board Game Rank: N" in the page
            m = re.search(r'Board Game Rank[:\s]*#?(\d[\d,]*)', html)
            if m:
                rank_val = m.group(1).replace(",", "")
                ranks[str(bgg_id)] = int(rank_val)
                print(f"#{rank_val}")
            else:
                # Check if it's an expansion or unranked
                if 'boardgameexpansion' in url or 'Board Game Rank' not in html:
                    print("expansion/unranked")
                else:
                    print("rank not found")

        except Exception as e:
            print(f"error: {e}")

        if i < total:
            time.sleep(2)

    return ranks


def main():
    print("Getting owned game BGG IDs...")
    bgg_ids = get_owned_game_ids()
    print(f"Found {len(bgg_ids)} owned games with BGG IDs\n")

    ranks = fetch_ranks(bgg_ids)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(ranks, f, ensure_ascii=False, indent=2)

    ranked = sum(1 for v in ranks.values() if v is not None)
    print(f"\nDone! {ranked}/{len(ranks)} games have rankings.")
    print(f"Saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
