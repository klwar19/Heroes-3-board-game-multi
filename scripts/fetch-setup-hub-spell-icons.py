#!/usr/bin/env python3
"""Fetch the classic HoMM3 spell-book icons used by the lobby Setup Hub.

Source: https://heroes.thelazy.net/index.php/List_of_spells (fan wiki) — the
same art the Heegu-sama/Homm3BG print files use. Each icon is the full-size
74x70 spell-book art, resolved through the wiki's MediaWiki API (the hashed
/images/ path cannot be derived from the name).
Output: public/assets/spell-icons/<slug>.png

view_air also repairs the Mulligan option-row icon (screen.tsx referenced a
view-air.png that never existed); view_earth is the Setup Hub's Map box,
visions its Advanced-settings box (see SETUP_HUB_ICONS in homm-assets.ts).
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
    "view_air": "View Air.png",
    "view_earth": "View Earth.png",
    "visions": "Visions.png",
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
    urls = resolve_urls(list(ICONS.values()))

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
