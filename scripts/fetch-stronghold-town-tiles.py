#!/usr/bin/env python3
"""
Fetch the REAL printed Stronghold town-board building tiles into

  public/assets/town-board/stronghold-<building>.webp        (six single bars)
  public/assets/town-board/stronghold-shared-one.webp        (shared bar, one built)
  public/assets/town-board/stronghold-shared-both.webp       (shared bar, both built)

These are photographs of the physical board-game tiles (391x819 each), not PC
townscape crops. The Stronghold board has seven bars for eight buildings, so the
Barracks Tower + Freelancer's Guild bar is a single printed DOUBLE-SIDED tile:
  - `-shared-one`  : Barracks Tower raised, Freelancer's Guild still a name/cost
                     plate (used while exactly one of the pair is built);
  - `-shared-both` : both raised (used once the pair is complete).
`src/data/towns/boards.ts` wires those two faces via the spec's `combinedTile`;
the six single bars overlay `stronghold-<building>.webp` per the tile-art
convention (public/assets/town-board/README.md).

Sources are the uploader's Steam UGC images (the same set collected in the
project's shared Drive folder). Idempotent: existing non-empty targets skip.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "public" / "assets" / "town-board"

# target file -> Steam UGC (id, sha1) for that printed tile
UGC = {
    "stronghold-city_hall.webp": ("2478758589664876491", "1B258219C24B4702DF91F28682CD0DAE6AFDCB0B"),
    "stronghold-dwelling_silver.webp": ("2478758589664880316", "A1E7FD7735724DE1AA3FB05AC9853649A393E22A"),
    "stronghold-hall_of_valhalla.webp": ("2478758589664882875", "4FE21DEF292B2B42AE95682D6476AB2893F08601"),
    "stronghold-citadel.webp": ("2478758589664885494", "85121332552EC4385F638B91EBB35C657FFE65A2"),
    "stronghold-mage_guild.webp": ("2478758589664887376", "8660819321D2462827E3CE00BECFFFC9768922FC"),
    "stronghold-dwelling_gold.webp": ("2478758589664889425", "7FD80D6C81192D9AA3E923FE986FCA2DE3587D68"),
    "stronghold-shared-one.webp": ("2478758589664873237", "5337AFA58C8E6893339FE20A10A60B53B812F25F"),
    "stronghold-shared-both.webp": ("2478758589664872945", "1926F4C3E2DFC552878914DEA0C6D127999BBD17"),
}


def steam_url(ugc_id: str, sha1: str) -> str:
    return f"https://steamusercontent-a.akamaihd.net/ugc/{ugc_id}/{sha1}/"


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    missing = {n: u for n, u in UGC.items() if not (ROOT / n).exists() or (ROOT / n).stat().st_size == 0}
    if not missing:
        print("  = all stronghold tiles already present")
        return
    for name, (ugc_id, sha1) in missing.items():
        request = urllib.request.Request(
            steam_url(ugc_id, sha1), headers={"User-Agent": "Mozilla/5.0 (town-board fetch script)"}
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            data = response.read()
        tile = Image.open(io.BytesIO(data)).convert("RGB")
        if tile.size != (391, 819):
            tile = tile.resize((391, 819), Image.LANCZOS)
        tile.save(ROOT / name, "WEBP", quality=90, method=6)
        print(f"  + {name}")


if __name__ == "__main__":
    main()
