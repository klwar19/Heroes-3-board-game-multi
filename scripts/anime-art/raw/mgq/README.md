# MGQ approved master drop

This directory contains the reviewed MGQ masters used by the deterministic
compositors. Most are original generated compositions guided by the verified
standing-art references. Regina, Aria, Lisa, Ooma, and sealed Ilias are explicit
identity-preserving exceptions: `scripts/compose-mgq-canonical-scenes.mjs`
trims/scales their verified standing PNG and places it unchanged over an
original scene. The cached reference PNGs remain ignored research inputs and
are never copied directly into `public/`.

Print the exact required inputs with:

```sh
node scripts/build-mgq-unit-cards.mjs --list-masters  # 58 Few/Pack masters
node scripts/build-mgq-art.mjs --list-masters         # 33 other masters
```

Masters must contain illustration only: no frame, title, statistics, rules,
logos, watermark, or UI symbols. Few and Pack are separate compositions. Duo
cards must show both named characters on Pack; form choices and safety rules are
recorded in `docs/mgq-art.md` and the two JSON contracts.

The compositor derives all final sizes, seven town strips, the town icon, board
tile alpha, editable overlays, and contact sheets. Never rename an accepted
master or bypass the preflight by inserting a placeholder image.
