# Monster Girl Quest town combat audio

The active MGQ pack uses the user-supplied female voices under
`E:\voice\rune factory 1` for all 29 roster units, the four summon-only
spirits, and commander Sonya. The old Microsoft Haruka files remain under
`voices/` only as unreferenced legacy assets; no `mgq/voices/*` manifest entry
points at them.

The complete, reviewable selection is
`scripts/anime-art/mgq-rune-factory-audio.json`. It records every unit's Rune
Factory speaker, exact numbered WAV for each action, post-voice effects, and a
short rationale. The selection uses all 20 female source characters. When one
source character supports two MGQ identities, the profiles use separate clip
sets wherever the source library permits it.

## Playback contract

- `attack`, `shoot`, and `move` are ordered manifest sequences: Rune Factory
  voice first, then a fitted effect from MGQ Paradox 2.41 `Audio/SE`.
- `defend`, `hurt`, and `death` are voice-only so reaction cues stay readable.
- Every action resolves to a concrete Ogg file; there is no synthetic or Heroes
  III fallback in the active MGQ resolver.
- Sylph, Gnome, Undine, Salamander, and Sonya use the same contract as normal
  roster units.

Run `node scripts/build-mgq-rune-factory-audio.mjs` to validate the source
paths, normalize the selected audio, and rebuild only the MGQ manifest
namespaces. `MGQ_RF_VOICE_ROOT` and `MGQ_SE_ROOT` can override the two source
roots. The build outputs mono 44.1 kHz Vorbis, normalizes voices to -18 LUFS,
caps effects at 1.6 seconds, and validates all 34 profiles before registration.
