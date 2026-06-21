#!/usr/bin/env python3
"""
Fetch the per-bank Creature Bank field-tile art (Naval Battles optional rule).

Until now every Creature Bank hex on the adventure map reused a single generic
montage (`/assets/locations-creature_bank.webp` — a strip of three unrelated
buildings), so a Crypt, a Pyramid and a Dragon Utopia all looked identical and
nothing like the printed field tile. The fan wiki publishes one cropped
field-tile scan per bank, named with the same `locations-<id>.webp` convention
this repo already uses, e.g.

  https://en.homm3bg.wiki/fields/crypt_creature_bank/  ->  assets/locations-crypt.webp

The wiki slug for each bank matches our CreatureBankId exactly, so we download
all twelve to:

  /assets/locations-<bankId>.webp

Like the other fetch scripts, every download is validated (HTTP 200 + a
decodable WebP) and the script aborts loudly on any miss, so a broken or
missing asset can never slip through into the board. The original bytes are
written verbatim (no re-encode) to preserve the wiki's quality.

This is a non-profit fan project; per src/data/assets/homm-assets.ts these
scans are placeholders to be replaced with owned art before any wider release.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

WIKI_ASSETS = "https://en.homm3bg.wiki/assets"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

# The twelve CreatureBankId values (src/data/map/creature-banks.ts). Each is
# also the wiki asset slug: locations-<id>.webp.
BANK_IDS = [
    "imp_cache",
    "crypt",
    "dwarven_treasury",
    "medusa_stores",
    "dragon_fly_hive",
    "shipwreck",
    "derelict_ship",
    "pyramid",
    "griffin_conservatory",
    "naga_bank",
    "cyclops_stockpile",
    "dragon_utopia",
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for bank_id in BANK_IDS:
        url = f"{WIKI_ASSETS}/locations-{bank_id}.webp"
        data = fetch(url)
        try:
            image = Image.open(io.BytesIO(data))
            image.verify()  # decodes/validates without keeping the pixels
            width, height = Image.open(io.BytesIO(data)).size
        except Exception as exc:  # pragma: no cover - guard against a bad download
            raise SystemExit(f"FAIL decode {bank_id}: {exc}")
        if width < 64 or height < 32:
            raise SystemExit(f"FAIL {bank_id}: implausibly small art {width}x{height}")
        dest = OUT / f"locations-{bank_id}.webp"
        dest.write_bytes(data)
        print(f"wrote {dest.relative_to(OUT.parent.parent)} ({width}x{height}, {len(data)} bytes)")


if __name__ == "__main__":
    main()
