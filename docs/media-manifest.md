# Media manifest — binary media lives on the CDN, not in git (2026-09-05)

The application repository contains **code plus a manifest**; every binary
media file (art, audio, video) lives in the Cloudflare R2 bucket behind
`https://cdn.hamthefirt.xyz` under an **immutable, content-addressed key**.
This replaced the 2026-08 layout (media tracked in `public/`, synced to R2 by a
GitHub workflow, cache-busted by one global `?v=`), which had made the repo grow
without bound and every Vercel clone carry hundreds of MB it never deployed.

## The contract

| Piece | Where | Tracked in git | Role |
| --- | --- | --- | --- |
| `media-manifest.json` | repo root | yes | **Source of truth for WHICH files exist.** One line per file, keyed by the public URL path without its leading slash (`assets/ui/x.webp`), with `md5`, `bytes` and, for raster images, `width`/`height`. |
| `src/lib/media-keys.generated.json` | `src/lib` | yes (derived) | The runtime map the browser uses: `{ "<dir>": { "<file>": "<md5[0:8]>" } }` grouped by directory (≈200 KB raw, ≈50 KB brotli). Always written together with the manifest; a test pins the lockstep. |
| R2 objects | bucket `heroes3` | — | **Source of truth for the BYTES.** Key = `<dir>/<name>.<md5[0:8]>.<ext>` (`contentAddressedKey`), `Cache-Control: public, max-age=31536000, immutable`, `Content-Type` from the extension. Objects are **never overwritten or deleted**; a changed file is a new key, old keys stay for rollback. |
| `public/assets/**`, `public/sounds/**` binaries | your disk only | **no** (`.gitignore`, per extension) | A local working copy. Build scripts write here; `media:pull` restores it; `media:publish` ships it. |
| `public/sounds/manifest.json`, `durations.json`, `README.md`s, `public/fonts/**`, `public/credits/**` | `public/` | yes | Code / docs / same-origin fonts — unchanged, imported or served as before. |

Media kinds: `webp png jpg jpeg gif svg avif mp4 webm mp3 ogg wav`
(`MEDIA_EXTENSIONS` in `scripts/lib/media-manifest.mjs`, mirrored by the
`.gitignore` block and by `src/lib/media-manifest.ts`). Any other extension
inside the media trees makes `media:publish` refuse, so a new kind is a
conscious addition to all three places.

### How a URL is resolved at runtime

`assetUrl("/assets/ui/x.webp")` (`src/lib/asset-url.ts`, the single seam every
consumer goes through — `asset-url-coverage.test.ts` forbids raw literals):

1. `NEXT_PUBLIC_ASSET_BASE_URL` empty (local dev with the media pulled) → the
   logical path, served by Next from `public/`.
2. Base URL set → look the path up in the runtime map → `<cdn>/assets/ui/x.<hash>.webp`.
3. Path not in the map (never published / stale map) → legacy fallback
   `<cdn>/assets/ui/x.webp?v=<manifest version>`; the bucket still holds every
   file published before 2026-09-05 at its logical key.

`globals.css` `url()` references cannot call JS: `next.config.ts` extracts them
(`cssMediaRefs`) and emits one **exact** redirect per reference to its
content-addressed object (`cssAssetRedirects`), listed before the classic
wildcard `/assets/:path*` redirect (legacy layout, `?v=`). A stylesheet
reference that is not in the manifest fails `src/lib/media-manifest.test.ts`.

The base URL itself (`resolveAssetBaseUrl`): explicit env var wins; Vercel
previews default to the CDN; **a checkout without the media tree defaults to the
CDN too** (`hasLocalMediaTree`), so a fresh clone's `next dev` / `next build`
shows art without pulling anything.

## Commands (`scripts/media.mjs`; credentials are read from `.env.local`)

| Command | Needs R2 creds | What it does |
| --- | --- | --- |
| `npm run media:status` | no | Local tree vs manifest: unpublished / size-mismatched / missing files. Exit 1 when they differ. |
| `npm run media:publish` | **yes** | Hash `public/assets|sounds`, upload every new or changed file to its content-addressed key (SigV4 `PutObject`, single-part with `Content-MD5`, skipping objects the bucket already has), HEAD-verify each object, then write **both** tracked files. `--dry-run` lists what would upload; `--all` also re-checks every manifest object and uploads any the bucket lacks; `--rehash` ignores the mtime shortcut. The manifest is **never** written unless every object verified. |
| `npm run media:pull` | no | Download every manifest entry missing or size-mismatched on this disk from the CDN, md5-checked, atomic writes. `--prune` deletes local media files not in the manifest. |
| `npm run media:verify` | no | HEAD every object on the CDN and compare `Content-Length`/`ETag` with the manifest (`--sample N` for the rotating daily sample + the screen-critical keys). |
| `node scripts/media.mjs manifest` | no | Rebuild the manifest + map from the local tree **without uploading** — for inspection only; never commit its output. TRAP: a later plain `publish` diffs against THAT manifest and sees nothing new — run `publish --all` afterwards (it probes the bucket). |

`.env.local` (gitignored) needs `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`; optional `R2_BUCKET` (default `heroes3`), `R2_ENDPOINT`.
npm never loads `.env.local`; the CLI does (`loadEnvLocal`). No Cloudflare
purge token is needed: nothing is ever overwritten.

## Day-to-day workflows

**You (or an AI session) created or replaced art / sound.** The file sits in
`public/…` as before. Then:

```bash
npm run media:publish
```

and commit `media-manifest.json` + `src/lib/media-keys.generated.json` together
with the code that references the file. Until you publish, the file exists only
on your disk: `src/lib/media-manifest.test.ts` ("matches the local media tree")
names it, and every art-existence test reads the manifest, so an unpublished
file is a red test — never a silent 404 in production.

**Fresh clone / CI / another machine.** Nothing to do for the app to render
(the build serves from the CDN). To work on media or run the byte-inspecting
tests:

```bash
npm run media:pull
```

**Rollback a bad replacement.** `git revert` the commit that changed the
manifest; the previous objects are still in the bucket, so the old URLs serve
again on the next deploy.

**Someone else published while you had an old tree.** `media:status` shows
`MISSING LOCALLY` / `SIZE MISMATCH`; run `media:pull`. Never run `publish` on a
tree you have not pulled first — its "gone" entries would leave the manifest
(the objects stay in the bucket, and a revert restores the entries).

## Tests

Helpers in `src/lib/media-manifest.ts` (node only): `hasMediaFile(url)`,
`mediaFileInfo(url)` (bytes, width, height), `listMediaDir(dirUrl)`,
`listMediaFiles(dirUrl)`, `localMediaPath(url)`. Rules:

- Existence, size-floor, dimension and directory-listing gates read the
  manifest, so they run on every checkout **and** fail for a local-only file.
- A test that needs the bytes (pixel/alpha scans, decoding audio, reading SVG
  text) runs only when `localMediaPath(url)` is non-null — after its
  manifest-level assertions, which always run.
- `media-manifest.test.ts` pins: the manifest's shape and sort order, the
  runtime map lockstep, parity between the TS reader and the `scripts/lib`
  twin (`contentAddressedKey`, version, map), every `globals.css` `url()` ref
  being published, and — when a local tree is present — that it matches the
  manifest.
- `asset-media-version.test.ts` pins the global version (a sha1 of every
  `key:md5`) and that the committed runtime map carries the same version.

## Deployment

- **Vercel**: `vercel.json` still runs `scripts/vercel-build.mjs`; it derives the
  version from the manifest and, if a pulled media tree happens to be present,
  stages it out of `public/` so it is never packaged. A normal Vercel clone has
  no media, so there is nothing to stage.
- **PartyKit**: unaffected (the room server serves no media).
- **Smoke test**: `.github/workflows/media-cdn-smoke.yml` runs
  `media verify --sample 120` weekly, on every push that changes the manifest,
  and on demand (`full` = every object). It needs no secrets. Note: GitHub
  Actions must be enabled/billed for the repository for it to run.

## Shrinking the repository history (one-time, destructive to history only)

Untracking the media stops the repository from growing; it does **not** shrink
the existing history (`.git` was 3.3 GB on 2026-09-05, of which the media blobs
are the bulk). Dropping them requires rewriting history:

1. Make sure every clone has pushed its work; pick a quiet moment.
2. In a **fresh** clone (never in a working tree with uncommitted changes):
   ```bash
   git clone --mirror https://github.com/klwar19/Heroes-3-board-game-multi.git repo-rewrite.git
   cd repo-rewrite.git
   git filter-repo --invert-paths \
     --path-regex '^public/(assets|sounds)/.*\.(webp|png|jpe?g|gif|svg|avif|mp4|webm|mp3|ogg|wav)$'
   git push --force --all && git push --force --tags
   ```
   (`git-filter-repo` is a Python script: `py -m pip install git-filter-repo`,
   then `py -m git_filter_repo …` if `git filter-repo` is not on PATH.)
3. In every existing clone, with a clean or committed working tree:
   ```bash
   git fetch origin
   git reset --soft origin/main      # moves the branch pointer; the working tree is NOT touched
   git reflog expire --expire=now --all && git gc --prune=now --aggressive
   ```
   Local branches other than `main` must be reset the same way onto their
   rewritten twins (`git reset --soft origin/<branch>`).
4. Vercel and GitHub Actions simply follow the new `main`.

Every commit keeps its code, message and author; only the media blobs disappear
(the manifest commit is the first one that no longer needs them).

## Limits / deliberate readings

- The runtime map is shipped to the browser (≈200 KB raw, ≈50 KB brotli, one
  JSON module). Grouping by directory is the size optimisation chosen; a
  build-time literal rewrite was rejected because many paths are built at
  runtime (`/assets/cards/${id}.webp`).
- The md5 prefix in a key is 8 hex chars; a collision only matters between two
  versions of the *same* path, and `media:publish` refuses to proceed if an
  existing object at the computed key carries a different md5.
- `hasLocalMediaTree` samples five manifest entries — a partially pulled tree
  counts as present (the invariant test then lists what is missing).
- The mtime shortcut in `buildManifestFromTree` reuses the previous manifest's
  entry when a file's size is unchanged and its mtime is older than the
  manifest file; `--rehash` forces full hashing.
- `media:pull` only downloads content-addressed objects, so a manifest produced
  before 2026-09-05 cannot be pulled (none was ever committed).
- Fonts stay tracked and same-origin (`CDN_SERVES_FONTS = false`).

## The SOURCES family — art masters (2026-09-05, same day)

The art pipeline's inputs — `scripts/anime-art`, `scripts/commander-art`,
`scripts/neutral-unit-art`, `scripts/doom-art`, `generated-session-art`,
`assets-to-translate` (raw renders, PSD-grade PNGs, review sheets, translation
scans; ~1.1 GB, never served to players) — left git the same way. Differences from
the media family, all driven by `FAMILIES.sources` in `scripts/lib/media-manifest.mjs`:

| | media | sources |
| --- | --- | --- |
| manifest | `media-manifest.json` | `sources-manifest.json` |
| key | public URL path (`assets/ui/x.webp`) | repo-relative path (`scripts/anime-art/raw/x.png`) |
| object | `<key>.<md5:8>.<ext>` | `sources/<key>.<md5:8>.<ext>` |
| kinds | webp png jpg gif svg avif mp4 webm mp3 ogg wav | png jpg webp gif psd tif bmp avif mp3 wav ogg mp4 mov bik (**svg / json / md / mjs stay tracked** — editable vectors and contracts are code) |
| runtime map | yes (`assetUrl`) | none (nothing is served) |
| unknown extension | refused | simply stays tracked |
| commands | `npm run media:<cmd>` | `npm run media:<cmd> -- --sources` |
| tests | `hasMediaFile` / `mediaFileInfo` / … | `hasSourceFile` / `sourceFileInfo` / `localSourcePath` |

A build script that needs its masters runs `npm run media:pull -- --sources` first
(one-time ~1.1 GB); publishing a new master is `npm run media:publish -- --sources`
and committing `sources-manifest.json`. Tests touching masters
(`art-foundation.test.ts`, `placeholder-neutral-card-images.test.ts`) assert
existence / dimensions / size from the sources manifest and inspect bytes only
when the file was pulled.
