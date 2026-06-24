# Browser route — edit cards with Gemini (Nano Banana) using a Pro subscription

This uses the **Gemini web app** (included in a Gemini Pro/Advanced subscription),
driven by a local Claude Code via a browser-automation MCP. It must run on the
machine where you're logged into Google — it CANNOT run in a cloud/web session.

## One-time setup (Windows, local Claude Code)

1. Install Node.js if you don't have it: <https://nodejs.org> (then reopen the terminal; `node -v` should print a version).

2. Add the Playwright MCP server, using a **persistent profile** so your Google
   login is remembered between runs:

   ```powershell
   claude mcp add playwright -- npx -y @playwright/mcp@latest --browser chrome --user-data-dir "%USERPROFILE%\gemini-profile"
   ```

3. Open this repo folder in Claude Code and pull the branch with this file.

4. First run only: tell Claude *"open gemini.google.com"*. A Chrome window opens —
   **log into your Google account once** in that window. The profile persists, so
   you won't need to log in again on later runs.

## The card-editing loop (tell your local Claude this)

> Using the Playwright MCP browser:
> 1. Go to gemini.google.com.
> 2. Start a new chat. Upload these two images:
>    - `public/assets/units-bulwark-bronze-kobolds-few.webp` (the creature art)
>    - `public/assets/units-blank-bronze.webp` (the empty bronze card frame)
> 3. Paste the prompt for the card I want (see PROMPTS below).
> 4. Wait for the image, screenshot it, and judge it against the frame + stats.
> 5. If wrong, re-prompt with a correction. When good, download it.

The AI directs and judges; Gemini only renders. Downloaded images land in your
browser's Downloads folder — move them into `public/assets/` (overwrite or
version) when approved.

## Kobold stats (verified from src/data/factions/units.ts)

| Card                  | Attack | Defense | Health | Initiative | Recruit cost |
|-----------------------|:------:|:-------:|:------:|:----------:|:------------:|
| Kobold (Few)          |   2    |    0    |   2    |     4      |   0 gold     |
| Kobold Foreman (Pack) |   2    |    1    |   3    |     5      |   2 gold     |

Left-column stat icons, top→bottom: crossed swords = Attack, shield = Defense,
red cross = Health, running figure = Initiative.

## PROMPTS

### Kobolds — Few ("Kobold")

> I'm giving you two images. Image 1 is creature artwork (a blue kobold warrior).
> Image 2 is an empty bronze fantasy card frame from a board game.
> Produce a single finished card: take the bronze frame from Image 2 EXACTLY as-is
> (same border, same four stat-icon slots on the left, same cost bar, same name
> banner), and place an enhanced, sharpened version of the creature from Image 1
> into the central art window. Then fill in the stats next to the left icons:
> crossed-swords icon = 2, shield icon = 0, red-cross icon = 2, running-figure
> icon = 4. Put the name "Kobold" in the bottom banner. Recruit cost in the cost
> bar = 0 gold. Keep all numbers crisp and legible. Do not invent extra text.

### Kobolds — Pack ("Kobold Foreman")

> Same as above but the creature art is from `units-bulwark-bronze-kobolds-pack.webp`,
> the name banner says "Kobold Foreman", and the stats are: crossed-swords = 2,
> shield = 1, red-cross = 3, running-figure = 5, recruit cost = 2 gold. Add small
> ability text in the banner area: "Map: gain 1 gold at the start of each Resource
> round."

## Caveats (so you're not surprised)

- The Gemini app can be finicky to automate (dynamic UI, occasional re-login).
- Image models are imperfect at exact numbers/borders; uploading the real frame
  (Image 2) helps a lot, but verify every stat by eye before saving.
- If reliability matters more than cost, the API route
  (`scripts/edit-card-image.mjs`, billing enabled) is steadier than the browser.
