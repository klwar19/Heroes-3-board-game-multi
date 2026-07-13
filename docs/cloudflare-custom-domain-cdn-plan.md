# Cloudflare + own domain: begin-to-end CDN plan (`cdn.<your-domain>`)

Goal: move the game's static weight — `public/assets` (225 MB, ~1,555 files)
and `public/sounds` (~1,281 clips) — off the Vercel app origin onto Cloudflare
R2 behind **your own domain**, so that

- Vercel stops paying bandwidth for art/audio (its free tier is 100 GB/month;
  a handful of fresh players per day can burn through that),
- players load assets from Cloudflare's edge (POPs in Hanoi/HCMC and worldwide,
  HTTP/3, zero R2 egress fees),
- the app gains a permanent identity (`your-domain`) independent of
  `*.vercel.app`, and
- live multiplayer (PartyKit WebSockets) is untouched.

Honest status first — what is already done vs. NOT done:

- **DONE (in repo)**: every JS/TS-rendered image, sprite sheet, CSS-in-JS
  background and sound routes through `assetUrl()`
  (`src/lib/asset-url.ts`) — 182 call sites. Flipping ONE env var
  (`NEXT_PUBLIC_ASSET_BASE_URL`) redirects all of it. Covered by
  `src/lib/asset-url.test.ts` and the raw-literal regression guard in
  `src/lib/asset-url-coverage.test.ts`.
- **DONE (in repo)**: upload tooling — `npm run sync:assets`
  (`scripts/sync-assets-to-r2.sh`) uploads `public/assets` + `public/sounds`
  to the `heroes3` bucket with correct content types and cache headers.
- **DONE (in repo)**: when the env var is set, the app emits
  `<link rel="preconnect">` / `dns-prefetch` for the CDN origin
  (`src/components/asset-preconnect.tsx`), shaving the TLS handshake off the
  first asset fetch.
- **NOT done by code and cannot be**: the manual dashboard/registrar steps in
  Phases 1–6 below (buying the domain, nameserver change, R2 custom domain,
  Cloudflare cache rule, Vercel env). This document is the runbook for them.
- **Deliberately NOT migrated**: 23 `url("/assets/…")` backgrounds + 4
  `@font-face` fonts hard-coded in `src/app/globals.css`. CSS cannot call JS,
  so these stay on the app origin — which keeps working because `public/`
  stays deployed to Vercel as a full fallback. They are small UI chrome
  (leather textures, backdrops, fonts), not the 56 MB of board art. Fonts
  staying same-origin also sidesteps the `@font-face` cross-origin CORS
  requirement entirely.

## Target architecture

```
players ──HTTPS──► your-domain.com / www  ──(DNS only, grey cloud)──► Vercel
                     │  Next.js pages, API routes, accounts,
                     │  globals.css assets + /fonts (same-origin fallback)
                     │
         ──HTTPS──► cdn.your-domain.com  ──(proxied, orange cloud)──► R2 `heroes3`
                     │  /assets/**  /sounds/**   (immutable-ish, edge-cached)
                     │
         ──WSS────► heroes3bg-rooms.<user>.partykit.dev   (unchanged)
                        rooms, lobby, chat — already on Cloudflare's edge
```

Key rule: **R2 gets the game media; Vercel keeps the app; PartyKit keeps the
sockets.** Never point `NEXT_PUBLIC_PARTYKIT_HOST` at R2, and never put the S3
API endpoint (`<account>.r2.cloudflarestorage.com/heroes3`) in
`NEXT_PUBLIC_ASSET_BASE_URL` — that endpoint requires signed requests and is
not a CDN (see `docs/cloudflare-r2-setup.md`).

## Phase 0 — decisions & prerequisites (10 min)

- Pick the domain name. Any TLD works; `.com`/`.net`/`.vn` are all fine with
  Cloudflare. Cost at Nhân Hòa: roughly 200–350k VND/year for `.com` (renewal
  price matters more than the first-year promo — check both).
- Accounts you need: Nhân Hòa (nhanhoa.com), Cloudflare (free plan is enough;
  the `heroes3` R2 bucket already exists), Vercel (project owner), GitHub
  (repo secrets, for the PartyKit deploy workflow).
- Subdomain layout (recommendation, used throughout):
  - `cdn.your-domain.com` → R2 bucket (this plan's core)
  - `your-domain.com` + `www` → Vercel app (Phase 9, optional but recommended)
- R2 free tier: 10 GB storage / 1M class-A + 10M class-B ops per month, **zero
  egress fees**. 225 MB of assets is far inside free.

## Phase 1 — buy the domain at Nhân Hòa (15 min, manual)

1. nhanhoa.com → search the domain → add to cart → pay. Skip every add-on
   (hosting, email, "DNS Pro") — Cloudflare will do DNS for free.
2. In the Nhân Hòa customer portal, confirm the domain shows as active and
   that you can open its management page ("Quản lý tên miền" / domain
   management). Exact menu names vary; if you cannot find the
   nameserver/DNS setting, their support ticket system will change it for
   you (that is routine for registrars).
3. Leave everything default for now — the only thing this plan ever changes at
   Nhân Hòa is the **nameservers** (Phase 3). Registrar lock / WHOIS privacy:
   keep whatever they enable by default.

## Phase 2 — add the zone to Cloudflare (5 min, manual)

1. Cloudflare dashboard → **Add a domain** → enter `your-domain.com` → pick
   the **Free** plan.
2. Cloudflare scans existing DNS records; a fresh domain has none worth
   keeping. Do NOT add records yet.
3. Cloudflare shows **two nameservers** assigned to your zone, e.g.
   `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`. Copy both exactly —
   the pair is account-specific.

## Phase 3 — set the Cloudflare nameservers at Nhân Hòa (5 min, manual)

1. Nhân Hòa portal → the domain's management page → nameserver / "Đổi DNS"
   section → replace the default Nhân Hòa nameservers with the two Cloudflare
   ones from Phase 2 (delete any extras; exactly the two).
2. Save. If the portal refuses or the option is missing, open a support
   ticket: "Đổi nameserver cho tên miền … sang ada.ns.cloudflare.com và
   bob.ns.cloudflare.com".

## Phase 4 — wait for Active (minutes to ~24 h, usually < 2 h)

1. Cloudflare zone Overview shows "Pending Nameserver Update" until the
   registry change propagates; you'll get an email when it flips to
   **Active**. Check progress yourself with `dig NS your-domain.com +short`
   (or an online dig tool) — it must return the two Cloudflare nameservers.
2. Once Active, set zone-wide basics (all free-plan, one-time):
   - SSL/TLS → mode **Full (strict)** (safe: R2 custom domains and Vercel both
     present valid origin certs).
   - SSL/TLS → Edge Certificates → **Always Use HTTPS: On**.
   - Speed → HTTP/3: **On** (usually default). Brotli: on by default.

## Phase 5 — attach `cdn.your-domain.com` to the R2 bucket (10 min, manual)

1. Cloudflare dashboard → **R2** → bucket `heroes3` → **Settings** → Public
   access → **Custom Domains** → *Connect domain* → `cdn.your-domain.com`.
2. Cloudflare auto-creates the proxied DNS record and issues the edge
   certificate; status goes **Active** within minutes. No manual DNS record
   needed for `cdn`.
3. Why a custom domain instead of the `*.r2.dev` development URL: `r2.dev` is
   rate-limited, uncached, and meant for testing only. A custom domain gets
   the full Cloudflare cache + cache rules + your name on it. (This is also
   exactly why this plan needs your own domain at all.)

## Phase 6 — cache & access configuration (10 min, manual)

1. **Cache Rule** (zone → Caching → Cache Rules → Create):
   - When: `Hostname equals cdn.your-domain.com`
   - Then: **Eligible for cache**; Edge TTL → *Override origin* → **30 days**;
     Browser TTL → *Respect origin* (the sync script sets
     `Cache-Control: public, max-age=604800` — 7 days — on every object).
   - Rationale: art files in this repo are occasionally REPLACED under the
     same filename (e.g. town-board scans), so "1 year immutable" would be
     wrong. 7-day browser / 30-day edge means players re-validate weekly and
     you can force updates instantly with a cache purge (see Operations).
2. **R2 CORS**: not required — sounds play through `HTMLAudioElement` and art
   through `<img>`/CSS backgrounds, none of which need CORS, and fonts stay
   same-origin. Optionally add a GET/HEAD allow rule for
   `https://your-domain.com` + `https://*.vercel.app` as future-proofing
   (harmless), per `docs/cloudflare-r2-setup.md`.
3. Leave public-bucket listing OFF (custom domain serves objects only —
   default behaviour).

## Phase 7 — upload the assets + smoke test (15 min, semi-automated)

1. Create an R2 API token: R2 → **Manage R2 API Tokens** → Create → permission
   **Object Read & Write**, scoped to bucket `heroes3`. Note the Access Key
   ID / Secret Access Key, and your Cloudflare **Account ID** (dashboard URL
   or R2 overview page).
2. Install rclone (`sudo apt install rclone` / `brew install rclone` /
   rclone.org). The sync script drives it with no config file needed.
3. From the repo root:

   ```sh
   export R2_ACCOUNT_ID=<account id>
   export R2_ACCESS_KEY_ID=<access key id>
   export R2_SECRET_ACCESS_KEY=<secret>
   npm run sync:assets -- --dry-run   # inspect what would upload
   npm run sync:assets                # real upload (~225 MB; resumable/idempotent)
   ```

   The script uploads `public/assets → assets/`, `public/sounds → sounds/`,
   stamps `Cache-Control` on every object, auto-detects content types by
   extension, and finally uploads a `cdn-check.txt` health object. Re-running
   only transfers changed files.
4. Smoke test (the user-visible "step 6"):

   ```sh
   curl -sI https://cdn.your-domain.com/cdn-check.txt          # 200, text/plain
   curl -sI https://cdn.your-domain.com/assets/ui/map-backdrop.jpg
   # expect: HTTP/2 200, content-type: image/jpeg,
   #         cache-control: public, max-age=604800
   curl -sI https://cdn.your-domain.com/assets/ui/map-backdrop.jpg | grep -i cf-cache-status
   # first hit MISS, second hit HIT  ← proves the edge cache is on
   curl -sI https://cdn.your-domain.com/sounds/manifest.json    # sounds tree present
   ```

   Any 404 here means the object key layout is wrong — fix before Phase 8.

## Phase 8 — point the app at the CDN (10 min, manual + redeploy)

1. Vercel → project → Settings → Environment Variables → add
   `NEXT_PUBLIC_ASSET_BASE_URL = https://cdn.your-domain.com`
   (Production; add Preview too if previews should use the CDN).
2. **Redeploy.** `NEXT_PUBLIC_*` vars are inlined at build time — an existing
   deployment does not pick the value up.
3. Verify in the browser (DevTools → Network):
   - unit cards / board art / sounds load from `cdn.your-domain.com`,
   - `globals.css` backdrops and `/fonts/*.ttf` still load from the app origin
     (expected — see "Deliberately NOT migrated" above),
   - the `<head>` contains `<link rel="preconnect" href="https://cdn.…">`,
   - the PartyKit WebSocket still connects to `*.partykit.dev`,
   - a two-browser lobby/room session still syncs.
4. Rollback is instant and safe at every point: delete the env var and
   redeploy — `public/` never left Vercel, so everything falls back to
   same-origin serving.

## Phase 9 (recommended follow-up) — the app itself on your domain

1. Vercel → project → Settings → Domains → add `your-domain.com` and
   `www.your-domain.com`. Vercel shows the DNS records it wants.
2. In Cloudflare DNS, create them with **proxy OFF (grey cloud / DNS only)**:
   - `A your-domain.com → 76.76.21.21` (or the CNAME-flattened
     `cname.vercel-dns.com` target Vercel displays),
   - `CNAME www → cname.vercel-dns.com`.
   Grey cloud matters: Vercel is itself a CDN with its own TLS; double-proxying
   through the orange cloud is Vercel-discouraged and causes cert/caching
   surprises. Your domain still gets full Cloudflare DNS + the proxied `cdn`
   host; the app host just rides Vercel's edge directly.
3. After the domain is live, update the PartyKit edge so verified accounts
   and match reporting target the canonical origin:
   - `partykit.json` → `vars.HOMM3BG_APP_URL = "https://your-domain.com"`,
   - the `HOMM3BG_APP_URL` GitHub Actions secret (deploy workflow) to match,
   - then `npm run deploy:partykit` (REQUIRED — a Vercel deploy alone never
     updates the edge; see the deploy note in CLAUDE.md).
4. Optional cosmetics, explicitly deferred: a custom domain for PartyKit
   itself (`ws.your-domain.com`). The socket host is already on Cloudflare's
   network, so this buys branding, not performance — skip until it matters.

## Verification checklist (end of rollout)

- [ ] `dig NS your-domain.com +short` → the two Cloudflare nameservers.
- [ ] Zone shows **Active**; SSL mode Full (strict); Always-HTTPS on.
- [ ] `cdn.your-domain.com` listed as Active under the R2 bucket's custom domains.
- [ ] `cdn-check.txt` + a sampled image + a sampled sound return 200 with the
      right `content-type` and `cache-control`; second request `cf-cache-status: HIT`.
- [ ] Production app: art + audio from `cdn.…`, fonts + CSS backdrops from the
      app origin, preconnect tag present.
- [ ] Rooms: create/join, WebSocket sync, lobby chat — all unchanged.
- [ ] (Phase 9) app reachable on `your-domain.com`, PartyKit redeployed with
      the new `HOMM3BG_APP_URL`.

## Operations after rollout

- **Art/sound changed in the repo** → run `npm run sync:assets`, then purge:
  Cloudflare zone → Caching → Purge Cache → *Custom purge* by URL or the
  `cdn.your-domain.com` hostname (free plan allows hostname/URL purge).
  Browsers refresh within the 7-day `max-age` on their own; purge only
  matters when a replaced file must show up immediately.
- **New assets in a feature branch**: merge first, sync after — the app
  falls back to nothing if a data file references a key that is not in R2
  yet and the env var is set, because the browser only asks the CDN. Simple
  rule: **sync R2 before (or with) every production deploy that adds art.**
  (Until then the old deploy keeps working — keys are only added, never
  removed, by the sync script; it does not `--delete` by default.)
- **Cost watch**: R2 dashboard → usage. Expected: storage ~0.25 GB, ops well
  inside free tier, egress $0 forever.
- **Source of truth stays `public/` in git.** R2 is a mirror; never hand-edit
  objects in the bucket.

## Risks & gotchas (read once)

| Risk | Mitigation |
| --- | --- |
| S3 API endpoint mistaken for the CDN URL | Only ever use `https://cdn.your-domain.com` in the env var (Phase 5.3). |
| Orange-clouding the Vercel records | Phase 9 uses DNS-only (grey) records for the app host. |
| Stale art after replacing a same-named file | 7d browser TTL + purge-by-URL workflow (Operations). |
| Env var set but bucket not synced | Phase 7 runs before Phase 8; smoke-test curls gate the flip. |
| `NEXT_PUBLIC_*` not applied | It is build-time-inlined — always redeploy after changing it (Phase 8.2). |
| Nameserver propagation stalls > 24 h | Re-check the NS values typed at Nhân Hòa; open their support ticket. |
| CSS/font references break on the CDN | They never move — `globals.css` assets and `/fonts` stay same-origin by design. |
| A future raw `src="/assets/…"` literal bypasses the CDN | `src/lib/asset-url-coverage.test.ts` fails CI on any unwrapped literal. |

## Related docs

- `docs/cloudflare-r2-setup.md` — the original R2/PartyKit layout note (kept;
  this file supersedes its rollout section with the custom-domain runbook).
- `.env.example` — `NEXT_PUBLIC_ASSET_BASE_URL` documentation.
- `docs/multiplayer-performance-scaling-upgrade-plan.md` — the wider
  performance program this plan slots into.
