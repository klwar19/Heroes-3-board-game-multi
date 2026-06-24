# AI card-image editing (Gemini "Nano Banana")

Edit the card art in `public/assets/*.webp` with Gemini 2.5 Flash Image. The AI
writes the prompts and judges the results; Gemini only renders the pixels.

## Setup (one time)

1. Get a **free API key** at <https://aistudio.google.com> → **"Get API key"**.
   (This is separate from a Gemini chat/Pro subscription — the subscription has
   no API.)
2. Store it:
   - PowerShell: `setx GEMINI_API_KEY "your-key"` then reopen the terminal.
   - bash/zsh: `export GEMINI_API_KEY="your-key"`.

## Use

```bash
node scripts/edit-card-image.mjs <input> "<edit prompt>" [output]
```

Example:

```bash
node scripts/edit-card-image.mjs \
  public/assets/units-bulwark-bronze-kobolds-few.webp \
  "Make the background a stormy dusk sky, keep the unit and frame unchanged" \
  out/kobolds-few.v1.png
```

Output defaults to `out/<name>.edited.png` if you omit the path.

## The judging loop

1. Pick a card + write an edit prompt.
2. Run the script → image saved to `out/`.
3. Open the image, judge it. Good → keep. Off → tweak the prompt, rerun.
4. When happy, move the result over the original `.webp` (or keep versions).

The `out/` folder is throwaway working space — add it to `.gitignore` if you
don't want intermediate versions committed.
