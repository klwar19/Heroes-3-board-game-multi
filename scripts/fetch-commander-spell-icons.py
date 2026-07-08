#!/usr/bin/env python3
"""Fetch the classic HoMM3 spell-book icons used by the WOG Commander UI.

Source: https://heroes.thelazy.net/index.php/List_of_spells (fan wiki).
Each icon is the full-size 74x70 spell-book art, resolved through the wiki's
MediaWiki API (the hashed /images/ path cannot be derived from the name).
Output: public/assets/spell-icons/<slug>.png

The mapping mirrors src/data/commanders.ts — every commander cast icon and
every combination-skill icon must exist here.
"""

import json
import os
import sys
import urllib.parse
import urllib.request

WIKI_API = "https://heroes.thelazy.net/api.php"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "assets", "spell-icons")

# slug (asset name) -> wiki File: title
ICONS = {
    # Commander cast icons.
    "cure": "Cure.png",
    "shield": "Shield.png",
    "precision": "Precision.png",
    "fire_shield": "Fire Shield.png",
    "bloodlust": "Bloodlust.png",
    "animate_dead": "Animate Dead.png",
    "stone_skin": "Stone Skin.png",
    "haste": "Haste.png",
    "counterstrike": "Counterstrike.png",
    "slow": "Slow.png",
    "sacrifice": "Sacrifice.png",
    # Combination-skill icons.
    "forgetfulness": "Forgetfulness.png",
    "magic_arrow": "Magic Arrow.png",
    "frenzy": "Frenzy.png",
    "disrupting_ray": "Disrupting Ray.png",
    "sorrow": "Sorrow.png",
    "fireball": "Fireball.png",
    "force_field": "Force Field.png",
    "slayer": "Slayer.png",
    "blind": "Blind.png",
    "resurrection": "Resurrection.png",
    "death_ripple": "Death Ripple.png",
    "teleport": "Teleport.png",
}


def resolve_urls(titles):
    """File: titles -> direct image URLs via the MediaWiki API (batched)."""
    joined = "|".join(f"File:{title}" for title in titles)
    query = urllib.parse.urlencode(
        {"action": "query", "titles": joined, "prop": "imageinfo", "iiprop": "url", "format": "json"}
    )
    with urllib.request.urlopen(f"{WIKI_API}?{query}") as response:
        payload = json.load(response)
    urls = {}
    for page in payload["query"]["pages"].values():
        title = page["title"].removeprefix("File:")
        info = page.get("imageinfo")
        if info:
            urls[title] = info[0]["url"]
    return urls


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    titles = list(ICONS.values())
    urls = {}
    for start in range(0, len(titles), 25):
        urls.update(resolve_urls(titles[start : start + 25]))

    missing = []
    for slug, title in ICONS.items():
        url = urls.get(title)
        if not url:
            missing.append(title)
            continue
        out_path = os.path.join(OUT_DIR, f"{slug}.png")
        with urllib.request.urlopen(url) as response, open(out_path, "wb") as out:
            out.write(response.read())
        print(f"{slug}.png <- {url}")

    if missing:
        print(f"MISSING on the wiki: {missing}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
