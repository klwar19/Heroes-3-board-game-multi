#!/usr/bin/env python3
"""
Round 3 of the 2026-08-04 wiki art refresh: import the REAL printed card scans
that en.homm3bg.wiki now publishes for three families whose repo faces were
either locally GENERATED composites or older scans.

Three families, three reasons
-----------------------------
1) BASIC X MAGIC ability faces (4 cards, q92)
   public/assets/abilities-basic_{air,earth,fire,water}_magic.webp used to be
   built by scripts/build-basic-magic-ability-cards.mjs, whose header recorded
   that "wiki pages expose only the player-deck back". That is no longer true:
   the wiki now serves the genuine printed scans (CONFLUX 034-037/080) under the
   mirrored names, so the generated composites are replaced by the real cards
   and that build script is marked STALE.

2) STRONGHOLD / COVE / CONFLUX expansion ARTIFACT faces (18 cards, q92)
   EXACTLY the artifacts the wiki's https://en.homm3bg.wiki/artifacts/ Content
   column lists under "Stronghold Expansion" (4), "Cove Expansion" (6) and
   "Conflux Expansion" (8). All 18 already exist as repo cards in
   src/data/cards/artifacts.ts, so this script only ever REPLACES a face — it
   never introduces a new asset name. 17 of the 18 mirror the repo name 1:1;
   Plate of the Dying Light needs a remote/local rename (the wiki drops the
   "the": artifacts_relic-plate_of_dying_light.webp), taken from its own wiki
   page exactly like Torso of Legion in scripts/fetch-missing-spell-card-art.py.

3) CREATURE BANK unit faces (18 cards, q94)
   public/assets/units-creature-bank-*.webp used to be built by
   scripts/build-creature-bank-unit-cards.mjs, which cropped each creature's
   faction Few scan and overlaid the bank's own stats/rules because the wiki
   images were blank. The wiki now serves the genuine NAVAL BATTLES card scans —
   but NOT under a units-* name, which is why a mirror-name probe 404s. They are
   bank-scoped:  creature_banks-<bank_slug>-<unit_slug>.webp  and are linked
   from each creature's own /units/<unit>/ page. Each is a photographed physical
   card: no tier badge, no cost band (the cost strip carries the BANK NAME
   instead), the bank's own stats, and a "NAVAL BATTLES nnn/082" legal line.
   q94/method=6 is this family's convention (it is in compress-media.mjs's
   EXCLUDE_IMAGE list precisely so its quality is never re-encoded down).

   WRAITHS DIVERGENCE (deliberate): the wiki has TWO Wraith bank cards, Crypt
   (007/082) and Shipwreck (012/082). They are the same artwork, the same stats
   (A2/D0/H3/I5) and the same rules text — they differ ONLY in the bank-name
   band and the collector number. src/data/map/creature-banks.ts models ONE
   shared "neutral.wraiths" entry for both banks (see its "re-uses the Wraiths
   bank card" comment), so this script imports the CRYPT face. If the repo ever
   splits the two banks into separate cards, add the Shipwreck scan then.

Every download is validated (HTTP 200 + decodable WEBP + card-sized) and the
script aborts loudly on any miss, so a 404 HTML error page can never be written
as an asset, and a scan SMALLER than the printed card size is refused rather
than upscaled. Files are re-encoded deterministically and written ONLY when the
bytes actually differ, so a re-run is a no-op.

Do NOT run scripts/compress-media.mjs over these files afterwards: it would
re-encode them at its own lower quality and undo this batch.
"""
import io
import os
import ssl
import sys
import urllib.request
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parent.parent / "public" / "assets"
BASE = "https://en.homm3bg.wiki/assets"
CARD_SIZE = (743, 1040)
METHOD = 6

# (remote filename on the wiki, local filename in public/assets). The pair is
# kept explicit everywhere so a future rename is a one-line edit.
BASIC_MAGIC = [
    (f"abilities-basic_{school}_magic.webp", f"abilities-basic_{school}_magic.webp")
    for school in ("air", "earth", "fire", "water")
]

ARTIFACTS = [
    # --- Stronghold Expansion (4) -------------------------------------------
    ("artifacts_minor-bowstring_of_the_unicorns_mane.webp", "artifacts_minor-bowstring_of_the_unicorns_mane.webp"),
    ("artifacts_minor-quiet_eye_of_the_dragon.webp", "artifacts_minor-quiet_eye_of_the_dragon.webp"),
    ("artifacts_major-diplomats_ring.webp", "artifacts_major-diplomats_ring.webp"),
    ("artifacts_relic-thunder_helmet.webp", "artifacts_relic-thunder_helmet.webp"),
    # --- Cove Expansion (6) -------------------------------------------------
    ("artifacts_minor-shamans_puppet.webp", "artifacts_minor-shamans_puppet.webp"),
    ("artifacts_major-crown_of_the_five_seas.webp", "artifacts_major-crown_of_the_five_seas.webp"),
    ("artifacts_major-royal_armor_of_nix.webp", "artifacts_major-royal_armor_of_nix.webp"),
    ("artifacts_major-shield_of_naval_glory.webp", "artifacts_major-shield_of_naval_glory.webp"),
    ("artifacts_major-trident_of_dominion.webp", "artifacts_major-trident_of_dominion.webp"),
    # The lone rename in this batch: the wiki drops "the" from the slug.
    ("artifacts_relic-plate_of_dying_light.webp", "artifacts_relic-plate_of_the_dying_light.webp"),
    # --- Conflux Expansion (8) ----------------------------------------------
    ("artifacts_major-orb_of_driving_rain.webp", "artifacts_major-orb_of_driving_rain.webp"),
    ("artifacts_major-orb_of_silt.webp", "artifacts_major-orb_of_silt.webp"),
    ("artifacts_major-orb_of_tempestuous_fire.webp", "artifacts_major-orb_of_tempestuous_fire.webp"),
    ("artifacts_major-orb_of_the_firmament.webp", "artifacts_major-orb_of_the_firmament.webp"),
    ("artifacts_relic-tome_of_air.webp", "artifacts_relic-tome_of_air.webp"),
    ("artifacts_relic-tome_of_earth.webp", "artifacts_relic-tome_of_earth.webp"),
    ("artifacts_relic-tome_of_fire.webp", "artifacts_relic-tome_of_fire.webp"),
    ("artifacts_relic-tome_of_water.webp", "artifacts_relic-tome_of_water.webp"),
]

# unit slug -> the bank whose printed card the repo's single shared face uses.
# Every entry is cross-checked against src/data/map/creature-banks.ts.
CREATURE_BANK_OF_UNIT = [
    ("skeletons", "crypt"),
    ("zombies", "crypt"),
    ("wraiths", "crypt"),  # see WRAITHS DIVERGENCE in the module docstring
    ("vampires", "crypt"),
    ("familiars", "imp_cache"),
    ("dwarves", "dwarven_treasury"),
    ("gold_golems", "pyramid"),
    ("diamond_golems", "pyramid"),
    ("medusas", "medusa_stores"),
    ("nagas", "naga_bank"),
    ("griffins", "griffin_conservatory"),
    ("dragon_flies", "dragon_fly_hive"),
    ("cyclopes", "cyclops_stockpile"),
    ("water_elementals", "derelict_ship"),
    ("black_dragons", "dragon_utopia"),
    ("crystal_dragons", "dragon_utopia"),
    ("faerie_dragons", "dragon_utopia"),
    ("gold_dragons", "dragon_utopia"),
]
CREATURE_BANKS = [
    (f"creature_banks-{bank}-{unit}.webp", f"units-creature-bank-{unit}.webp")
    for unit, bank in CREATURE_BANK_OF_UNIT
]

# family label -> (downloads, webp quality, size budget KB)
# The bank family's 450KB ceiling mirrors the band asserted in
# src/data/assets/creature-bank-unit-card-images.test.ts.
FAMILIES = [
    ("Basic X Magic ability faces", BASIC_MAGIC, 92, 250),
    ("Stronghold / Cove / Conflux artifacts", ARTIFACTS, 92, 250),
    ("Creature Bank unit faces", CREATURE_BANKS, 94, 450),
]


def _ctx() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ca = "/root/.ccr/ca-bundle.crt"  # agent-proxy MITM bundle, when present
    if os.path.exists(ca):
        ctx.load_verify_locations(ca)
    return ctx


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (homm3bg-card-art-importer)"})
    with urllib.request.urlopen(req, timeout=60, context=_ctx()) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def load_card(raw: bytes, url: str) -> Image.Image:
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"FAIL {url} is not a decodable image ({exc}) — 404 page?")
    if im.format != "WEBP":
        raise SystemExit(f"FAIL {url} is {im.format}, expected WEBP")
    if im.width < 400 or im.height < 600:
        raise SystemExit(f"FAIL {url} is suspiciously small {im.size}")
    if im.size != CARD_SIZE:
        # Never invent resolution: only downscale/normalise a LARGER scan.
        if im.width < CARD_SIZE[0] or im.height < CARD_SIZE[1]:
            raise SystemExit(f"FAIL {url} is {im.size}, smaller than the printed card {CARD_SIZE}")
        im = im.convert("RGB").resize(CARD_SIZE, Image.LANCZOS)
    return im.convert("RGB")


def encode(im: Image.Image, local: str, quality: int, budget_kb: int) -> bytes:
    """Preferred quality first, dropping only if the card blows the size budget."""
    for q in (quality, quality - 4, quality - 8):
        buf = io.BytesIO()
        im.save(buf, "WEBP", quality=q, method=METHOD)
        data = buf.getvalue()
        if len(data) <= budget_kb * 1024:
            if q != quality:
                print(f"    note {local} needed q={q} to fit {budget_kb}KB")
            return data
    print(f"    WARNING {local} is {len(data)/1024:.0f}KB (>{budget_kb}KB budget)", file=sys.stderr)
    return data


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    total_new = total_updated = total_unchanged = 0
    for label, downloads, quality, budget in FAMILIES:
        print(f"\n{label}  (q{quality}, <={budget}KB, {len(downloads)} cards)")
        new = updated = unchanged = 0
        for remote, local in downloads:
            url = f"{BASE}/{remote}"
            im = load_card(fetch(url), url)
            data = encode(im, local, quality, budget)
            dst = OUT / local
            before = dst.read_bytes() if dst.exists() else None
            if before is None:
                state, new = "NEW", new + 1
            elif before == data:
                state, unchanged = "unchanged", unchanged + 1
            else:
                state, updated = "updated", updated + 1
            if state != "unchanged":
                dst.write_bytes(data)
            rename = "" if remote == local else f"  <- {remote}"
            print(f"  {state:9s} {local:52s} {im.size[0]}x{im.size[1]}  {len(data)/1024:6.0f}KB{rename}")
        print(f"  -> {new} new, {updated} updated, {unchanged} unchanged")
        total_new += new
        total_updated += updated
        total_unchanged += unchanged
    print(f"\nDone. {total_new} new, {total_updated} updated, {total_unchanged} unchanged in {OUT}")


if __name__ == "__main__":
    main()
