# Azur Lane Japanese voices

These clips are the default-skin Japanese combat lines for the Azur Lane
characters currently implemented by this project. They were selected from the
`deepghs/azurlane_voices_jp` index and byte-range extracted from its verified
`voices.tar` archive. Original event mapping:

- `attack.ogg`: Skill Activation
- `hurt.ogg`: Low HP (`Honolulu` has no default Low HP recording, so her
  Defeat line is used)
- `death.ogg`: Defeat
- `move.ogg`: Start Mission
- `enterprise/ability.ogg`: Enterprise Skill Activation, used by Lucky E I/IV/VI

There is no `victory.ogg`: the game has no per-unit victory / combat-won sound
seam (`UnitSoundAction` is attack/shoot/defend/hurt/death/move only, and
`COMBAT_EVENT_SOUNDS` is keyed by event type, not by unit), so an MVP clip would
be dead weight. The 8 MVP files that shipped with the first import were removed.
Add them back only alongside a real per-unit victory seam that plays them.

The original recordings remain copyrighted Azur Lane game assets. The source
dataset declares its license as `other`; inclusion here does not grant a license
to redistribute them. Keep them private unless the relevant rights holder has
authorized publication.

Source index: https://huggingface.co/datasets/deepghs/azurlane_voices_jp

