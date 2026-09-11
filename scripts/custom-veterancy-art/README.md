# Custom-town veterancy artwork

Generated with the built-in ImageGen tool, one original animation sheet per ability. Sources are saved in this directory. Run `node scripts/build-custom-veterancy-media.mjs` to extract icons, prepare 16-frame WebP sheets, and synthesize the original sound cues. This is asset preparation, not a game/test runner.

Outputs: `public/game-tokens/rank-ability/custom-town/<name>.webp`, `public/fx/custom-town/<name>.webp`, and `public/fx/custom-town/<name>.mp3`. Frame 6 supplies the icon. Black-backed sprites use screen blending. No media CDN publication is needed: these are same-origin game assets.

The additional Break Cover, Clear Mind, Rescue Step and Blood Price prompts are saved in the corresponding `<name>-prompt.md` files beside their original PNG sheets. Their cues are synthesized rubble impact, cleansing chimes, an escape sweep and a low pulse/blade strike respectively.

## muscle-reversal

Use case: stylized-concept. Asset type: game combat VFX sprite sheet for Muscle Reversal, a defensive martial arts counterstrike. Create ONE 4 by 4 animation sprite sheet, exactly 16 evenly spaced square frames, row-major chronological order, total square image 1024x1024. Each frame has pure black background, no borders, no text, no people. A luminous amber clenched fist with a blue protective crescent compresses, punches outward in a gold impact ring, then dissolves into sparks. Icon-readable fist silhouette, painted high quality fantasy board game effect, centered in each cell, all particles inside each cell with 12% empty margin. Frame 6 strongest clear fist and shield emblem suitable as ability icon. Consistent camera and cell alignment. Black background for additive screen blend.

## returning-edge

Use case: stylized-concept. Asset type: one game combat VFX animation sprite sheet, Returning Edge sword counter. ONE 4x4 evenly spaced square grid of 16 chronological animation frames, total 1024x1024, row-major. Pure black backgrounds, no grid lines, no text, no characters. Luminous silver katana crescent with violet silk-like energy reverses direction and splits into two sweeping arcs, expands into fine white sparks, then fades. Painted fantasy boardgame VFX, clean silhouette, centered identical camera in each cell, effects wholly inside each cell with 15% empty margin. Frame 6 contains a clearly legible curved silver sword emblem for icon extraction. No letterforms, no watermark.

## covering-extraction

Use case: stylized-concept. Asset type: one game combat VFX animation sprite sheet, Covering Extraction. ONE 4x4 evenly spaced square grid of 16 chronological animation frames, total 1024x1024, row-major. Pure black background in every frame, no text or grid lines or people. Three crisp teal energy tracer bolts sweep above a small luminous steel-blue shield, opening a safe corridor represented by a bright cyan curved arrow beside the shield. Bolts streak, shield flares, arrow sweeps, particles fade. Painted high quality science-fantasy strategy game effect, modest white-gold impact sparks. Frame 6 is a clean shield-and-exit-arrow emblem usable as an ability icon. Centered identical camera; entire effect within each cell with 15 percent margin, no overlap across cell boundaries.

## meridian-exchange

Use case: stylized-concept. Asset type: ONE animated combat VFX sprite sheet for Meridian Exchange, wuxia healing-and-disruption qi technique. A square 4 by 4 array of exactly 16 evenly spaced chronological frames row-major, 1024x1024. Pure black background. NO grid lines or borders, NO text or letters, NO characters. Two luminous jade and crimson streams orbit one small golden acupuncture needle, the crimson current breaks into dim red fragments as the jade current becomes a blooming green lotus. High-quality hand-painted Chinese cultivation fantasy, clean simple silhouette at icon scale. Frame 6 shows central gold needle between jade lotus and red broken arc, usable as icon. Consistent centered framing, 15% empty margin in each cell; animation grows gently, exchanges currents then fades fully to black in last frames. No imagery crosses cell boundaries.

## rule-unravel

Use case: stylized-concept. Asset type: ONE animated combat VFX sprite sheet for Rule Unravel, a sorceress dispelling an enchantment and stealing its energy. Square 4 by 4 layout, 16 evenly spaced chronological frames row-major, 1024x1024. Every cell pure black background, no text, no glyphs or letters, no grid lines, no characters. An ornate violet ritual dagger cuts a circular golden magical chain; the broken links transform into small turquoise healing motes streaming inward. Elegant painted fantasy board game VFX, sharp iconic silhouette. Frame 6: unmistakable violet dagger through broken gold ring, as an icon. Same centered camera for all frames, 15 percent empty margin per cell. Animation begins with a subtle ring, cuts and shatters, gathers jade motes then fades in last frames. No effects crossing frame boundaries.

## field-repair

Use case: stylized-concept. Asset type: ONE combat VFX animation sheet for Field Recovery. A square 4 by 4 arrangement of exactly 16 chronological frames, row-major, each cell same square size, overall 1024x1024. Pure black backgrounds with NO visible grid lines, no text, no letters, no people. A small glowing emerald healing crystal nestled inside two silver protective wings, with a fine warm gold circular repair halo. Silver strands gently mend a crack in the crystal, then soft green restorative motes rise and dissolve. Painterly fantasy/science-fantasy game effect, clean readable medical/rescue silhouette, no red cross emblem. Frame 6 shows the strongest complete winged emerald crystal suitable as a tiny ability icon. Fixed centered camera, 15% empty margin inside each cell. Effect fully contained in each frame, gentle pulse, fade toward black in final frames.
