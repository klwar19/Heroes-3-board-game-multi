# Anime and Wuxia Mod Art Generation Record

Generation mode: OpenAI built-in image generation.

## Fuyuki City panorama

```text
Use case: stylized-concept
Asset type: widescreen town panorama for a fantasy strategy board-game UI
Primary request: Create an original, premium anime-fantasy city called Fuyuki City at blue hour, blending a modern Japanese riverside city with a hidden magical fortress and summoning academy.
Scene/backdrop: wide elevated view across a river toward layered city districts; illuminated arched bridge, elegant stone citadel, glass towers, red torii silhouettes, a circular summoning court glowing faintly in the central plaza, distant mountain ridge.
Style/medium: cinematic hand-painted anime background art with rich environmental detail, professional strategy-game town screen, crisp painterly textures, not a screenshot from any existing anime.
Composition/framing: 16:9 landscape; important architecture distributed across seven visually distinct vertical districts so UI building slots can reveal different areas; no characters in foreground; clear atmospheric depth.
Lighting/mood: deep indigo evening, warm amber windows, restrained ruby and electric-blue magical accents; heroic and mysterious, inviting rather than sinister.
Color palette: indigo, midnight blue, amber, vermilion, pale cyan.
Constraints: original design; no copyrighted characters, logos, text, labels, borders, UI, watermark, or card frame. No split screen. Architecture must remain readable when cropped into vertical building panels.
Avoid: photorealism, plastic 3D, generic cyberpunk neon overload, empty skyline, blurry architecture.
```

- Generated source: `C:\Users\klwar\.codex\generated_images\019f76eb-a1e8-7a83-9f8b-f75d3702e53b\exec-570bdabf-8eb6-4964-9e1c-45b2a523b51c.png`
- Game asset: `public/assets/anime/towns/fuyuki-city.png`

## Azure Breeze Sect panorama

```text
Use case: stylized-concept
Asset type: widescreen town panorama for a fantasy strategy board-game UI
Primary request: Create an original, premium wuxia/xianxia mountain sect named Azure Breeze Sect, a vast cultivated sanctuary built across floating jade peaks above a sea of clouds.
Scene/backdrop: wide elevated view of seven connected architectural districts: outer disciple courtyards, sword terraces, spirit-crane aerie, protector gate, alchemy pavilion, golden core meditation tower, and an ancient mountain guardian shrine; bridges and subtle formation glyphs connect the peaks.
Style/medium: cinematic hand-painted Chinese fantasy environment art, refined ink-wash influence fused with richly detailed strategy-game town illustration; elegant, handcrafted texture.
Composition/framing: 16:9 landscape; architecture distributed across seven distinct vertical regions for UI building-slot crops; no close foreground character; deep layered clouds and peaks.
Lighting/mood: luminous dawn above clouds, serene but powerful, sacred martial atmosphere.
Color palette: celadon jade, azure, white cloud, warm gold, touches of vermilion.
Materials/textures: weathered pale stone, glazed teal roof tiles, carved jade, silk banners, ancient pine, waterfall mist.
Constraints: original design; no text, labels, logos, borders, UI, watermark, or card frame; buildings must remain readable in narrow vertical crops.
Avoid: modern city, Japanese torii, European castles, plastic 3D, empty generic landscape, muddy low contrast.
```

- Generated source: `C:\Users\klwar\.codex\generated_images\019f76eb-a1e8-7a83-9f8b-f75d3702e53b\exec-11c31866-1db9-4b67-8814-3550c94fe04c.png`
- Game asset: `public/assets/anime/towns/azure-breeze-sect.png`

## Fuyuki City map tile

```text
Use case: production game asset. Asset type: square top-down map tile illustration for a fantasy strategy board game. Create an original Fuyuki City starting tile viewed perfectly from above, designed as one large regular hexagon containing seven clearly readable smaller hex fields: one central field and six surrounding fields. Central field: elegant moonlit anime-fantasy Japanese city and magical citadel. Surrounding fields, clockwise: glowing mana resource shrine, quiet city outskirts, impassable dark mountain ridge, guarded treasure courtyard, materials quarry, riverside road. Style: premium hand-painted anime strategy map, crisp readable terrain and structures, painterly not photorealistic, deep indigo evening with restrained ruby, amber and cyan magical accents. Composition: the large tile fills the square canvas with the full outer hex visible and a little transparent-looking neutral dark margin; straight top-down orthographic view; paths visually connect passable fields. No characters, no text, no numbers, no logos, no card frame, no UI, no watermark. Avoid perspective view, rectangular panorama, cyberpunk overload, blurry buildings, split screen.
```

- Generated source: `C:\Users\klwar\.codex\generated_images\019f76eb-a1e8-7a83-9f8b-f75d3702e53b\exec-79db27c8-4386-4fa5-8ed1-bea01754a934.png`
- Processed transparent game asset: `public/assets/anime/tiles/a-s1.webp`

## Azure Breeze Sect map tile

```text
Use case: production game asset. Asset type: square top-down map tile illustration for a fantasy strategy board game. Create an original Azure Breeze Sect starting tile viewed perfectly from above, designed as one large regular hexagon containing seven clearly readable smaller hex fields: one central field and six surrounding fields. Central field: majestic wuxia/xianxia mountain sect sanctuary with a jade sword pavilion. Surrounding fields, clockwise: ancient learning stone terrace, cloud bridge path, spirit-resource shrine, impassable jagged mountain wall, guarded treasure grotto, celestial valuables mine. Style: premium hand-painted Chinese fantasy strategy map with refined ink-wash influence and crisp readable terrain, celadon jade roofs, pale stone, cloud mist, waterfalls, pines, warm gold formation glyphs and small vermilion accents. Composition: the large tile fills the square canvas with the full outer hex visible and a little transparent-looking neutral dark margin; straight top-down orthographic view; paths and bridges visually connect passable fields. No characters, no text, no numbers, no logos, no card frame, no UI, no watermark. Avoid perspective view, Japanese torii, modern buildings, rectangular panorama, plastic 3D, muddy low contrast, split screen.
```

- Generated source: `C:\Users\klwar\.codex\generated_images\019f76eb-a1e8-7a83-9f8b-f75d3702e53b\exec-83fa9e04-f6ac-4ebd-ba08-77a4185df406.png`
- Processed transparent game asset: `public/assets/anime/tiles/w-s1.webp`

## Bin hero portrait (replace gold-unit reuse)

Generation mode: Codex CLI built-in `image_gen` via `scripts/codex-gen-art.ps1`.

- Generated source: `tmp/imagegen/bin-hero-portrait.png`
- Game asset: `public/assets/anime/heroes/bin.png`
- Note: must NOT match Sabers gold unit; specialty icon may still use `fuyuki-sabers.webp` (unit specialist).

## Astral Regent commander (replace gold-unit reuse)

- Generated source: `tmp/imagegen/astral-regent-commander.png`
- Art window: `scripts/commander-art/ruler.png`
- Built card: `public/assets/units-commander-ruler.webp` (`node scripts/build-commander-cards.mjs ruler`)

## Commander equipment paperdolls (anime / wuxia)

Classic keeps `public/assets/ui/commander-paperdoll-body.webp` + card bust.
Anime/wuxia hide the card bust and use themed bodies only:

- Anime: `tmp/imagegen/paperdoll-anime.png` → `public/assets/ui/commander-paperdoll-body-anime.webp`
- Wuxia: `tmp/imagegen/paperdoll-wuxia.png` → `public/assets/ui/commander-paperdoll-body-wuxia.webp`
