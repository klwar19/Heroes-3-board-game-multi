# Difficulty chess-piece art

`difficulty-chess-master.webp` — the painted master the Setup Hub's four
difficulty icons are cut from (Easy = Pawn · Normal = Knight · Hard = Rook ·
Impossible = King). 1536×1024, the four pieces side by side on a black field.

Build the icons from it with:

```bash
node scripts/build-difficulty-chess-icons.mjs
```

That writes `public/assets/ui/difficulty-{pawn,knight,rook,king}.webp` and is
deterministic — the same master always yields the same icons.

## Why the master is committed

The icons are a *cut* of one painted sheet, not four drawings. Without the sheet
in the repo the build script is unrunnable and the four `.webp` files become
unreproducible binaries that nobody can regenerate, re-crop or re-scale. It is
stored as q95 webp rather than the raw ~1.5 MB PNG: the icons are downscaled to
256 px, so the difference is invisible in the output and the repo stays light.

(This is not hypothetical — the original master was lost once already when an
uncommitted working copy was reverted, and only survived because the raw
generator output happened to still be in `~/.codex/generated_images`.)

## Regenerating the master

Painted with the desktop Codex CLI's `image_gen`, via the repo's generic
wrapper:

```bash
pwsh scripts/codex-gen-art.ps1 -TargetRel "scripts/chess-art/difficulty-chess-master.png" -Prompt "<prompt below>"
```

Note `codex-gen-art.ps1` writes into the clone named by its `$Root`; check that
before running it from a different working copy, then convert the PNG to
`difficulty-chess-master.webp` (quality 95).

Prompt:

> Four ornate antique chess pieces in a single row on a pure black background:
> pawn, knight, rook, king, left to right, in that order, clearly separated with
> black space between them. Aged gold and dark bronze metal with fine engraved
> filigree on the bases, museum-catalogue product lighting from the upper left,
> sharp focus, no text, no shadows cast onto the background, each piece upright
> and fully inside the frame. Their relative heights must be true to a real
> chess set: the pawn shortest, then the knight, then the rook, the king
> tallest.

The build script auto-detects the four pieces as column bands and **fails** if
it does not find exactly four, so a regenerated master that merges or crops a
piece is caught rather than silently shipped. It also keys the background cut on
near-pure black only (see `FIELD_LEVEL`), so keep the field black and keep the
pieces off it.
