# Low Roll Extra Shot projectile

Created with built-in ImageGen on 2026-09-08. The compressed, alpha-transparent
master is `arrow.webp`; rebuild the eight-frame 96×24 flight sheet with
`node scripts/build-low-roll-extra-shot-fx.mjs` from the repository root.
The runtime sheet is `public/assets/fx/low-roll-extra-shot-projectile.webp`.
The flight uses ordered glint frames, follows the target direction, and plays
the existing `units/wood-elf-shoot` bow-release recording. The impact uses the
existing spark sheet; the extra damage cue waits for the projectile presentation.

## Generation prompt

Use case: stylized-concept. Asset type: transparent game projectile sprite for Low Roll Extra Shot, a veteran archer follow-up attack in a classic fantasy strategy board game. Generate one single isolated arrow in perfect horizontal side view pointing RIGHT, centered on a wide canvas. Slim polished silver leaf-shaped arrowhead on the right, dark wooden shaft, green feather fletching on the left, fine warm gold glint along the arrowhead and short subtle pale-green wind streaks trailing left. Hand-painted late-1990s fantasy game sprite aesthetic, crisp readable silhouette at small size. Actual transparent background with alpha, no ground, no shadow, no frame, no lettering, no UI, no characters, no bow, no bullets, no guns. Entire arrow and short trail fully inside canvas with generous clear margins. One arrow only; not a sprite sheet. Width about three times height.

The tool twice baked in a transparency checkerboard. Final edit prompt:
“Keep the exact same single right-facing fantasy arrow. Replace the ENTIRE
checkerboard and all background marks with perfectly uniform flat vivid magenta
RGB 255,0,255 (#FF00FF), for game chroma-key extraction. No transparency
simulation, no checkerboard, no gradient, no haze, no shadows, no magenta lighting
or reflections on the arrow. Preserve the arrow's colors and silhouette; crisp
clean edges against the solid magenta background. Only one horizontal arrow
centered with clear margins.”

The build removes that matte, preserves transparent edges, downsizes the master,
and encodes the runtime sheet as WebP at quality 82, alpha quality 100, effort 6.
