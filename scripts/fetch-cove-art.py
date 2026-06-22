#!/usr/bin/env python3
"""
Fetch the PC hero portraits for the engine-wired Cove heroes, reusing the asset
conventions of fetch-extra-heroes-art-batch5.py.

The fan wiki Cove pages (https://en.homm3bg.wiki/towns/cove/) carry no printed
board scan yet, so — exactly like the Tower PC-portrait heroes and the
Valeska/Ingham/Septienna/batch-4/5 entries — we fall back to the classic
portrait from heroes.thelazy.net, hosted locally:

  PC portrait -> /assets/hero_portraits-<slug>.webp   (464x512)

All six Cove heroes are now engine-wired and ship their real classic PC portrait
(Astra = Cure, Cassiopeia = Oceanids, Jeremy = Cannon, Miriam = Scouting, Zilare
= Forgetfulness, Casmetra = Sorceresses). thelazy.net's Special:FilePath/<File>
redirect resolves each portrait regardless of its hashed storage path, so the
build environment can fetch all six (the earlier Casmetra placeholder is gone).

Every download is validated (HTTP 200 + decodable image); the script aborts
loudly on any miss so a broken asset can never slip through.
"""
import io
import urllib.request
from pathlib import Path

from PIL import Image

LAZY = "https://heroes.thelazy.net/index.php/Special:FilePath"
OUT = Path(__file__).resolve().parent.parent / "public" / "assets"

PORTRAIT_SIZE = (464, 512)  # classic PC portrait, matches existing files

# (local slug, thelazy.net File name) — classic HotA portraits via Special:FilePath.
PORTRAIT_HEROES = [
    ("astra", "Hero_Astra.png"),
    ("cassiopeia", "Hero_Cassiopeia.png"),
    ("jeremy", "Hero_Jeremy.png"),
    ("miriam", "Hero_Miriam.png"),
    ("zilare", "Hero_Zilare.png"),
    ("casmetra", "Hero_Casmetra.png"),
]


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (asset-importer)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        if resp.status != 200:
            raise SystemExit(f"FAIL {resp.status} {url}")
        return resp.read()


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for slug, path in PORTRAIT_HEROES:
        data = fetch(f"{LAZY}/{path}")
        try:
            image = Image.open(io.BytesIO(data)).convert("RGBA")
        except Exception as exc:  # pragma: no cover - guard against a bad download
            raise SystemExit(f"FAIL decode {slug}: {exc}")
        image = image.resize(PORTRAIT_SIZE, Image.LANCZOS)
        dest = OUT / f"hero_portraits-{slug}.webp"
        image.save(dest, "WEBP", quality=90)
        print(f"wrote {dest.relative_to(OUT.parent.parent)} ({image.size[0]}x{image.size[1]})")


if __name__ == "__main__":
    main()
