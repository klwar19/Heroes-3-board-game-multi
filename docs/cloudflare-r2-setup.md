# Cloudflare R2 plan (`heroes3` bucket)

> **The step-by-step custom-domain rollout now lives in
> `docs/cloudflare-custom-domain-cdn-plan.md`** (Nhân Hòa domain → Cloudflare
> zone → `cdn.<domain>` on this bucket → `npm run sync:assets` →
> `NEXT_PUBLIC_ASSET_BASE_URL`). This file remains the architecture note for
> why R2 only carries static media and never the multiplayer server.

The existing `heroes3` R2 bucket is useful for static game art and audio. It is
not the multiplayer server: live rooms and lobby chat need PartyKit/Cloudflare
Durable Objects because R2 provides object storage, not WebSockets or atomic
live room state.

## Safe production layout

- Next.js/Vercel: pages, same-origin API routes, accounts, and the lobby-chat
  proxy.
- PartyKit Durable Objects: authoritative rooms, room directory, shared maps,
  and the durable lobby-chat feed.
- R2 bucket `heroes3` (APAC): immutable `/assets/**` and `/sounds/**` files.

The supplied URL,
`https://be0e7aba3f1164bf6cabc8c6ebeff2d9.r2.cloudflarestorage.com/heroes3`,
is the bucket's S3 API endpoint. Do not put it in either
`NEXT_PUBLIC_PARTYKIT_HOST` or `NEXT_PUBLIC_ASSET_BASE_URL`: browser requests to
the S3 API require signatures and the bucket-root request currently returns an
HTTP 400. Attach a Cloudflare custom domain (recommended, for example
`assets.your-domain.example`) or enable an R2 public development URL first.

## Rollout

1. Add a public/custom domain to the `heroes3` bucket and configure R2 CORS for
   the production app origin. Permit `GET` and `HEAD`; no public writes.
2. Upload the contents of `public/assets/` as `assets/` and `public/sounds/` as
   `sounds/`, preserving paths and content types. Use long immutable cache
   headers only for versioned files; keep replaceable filenames on a shorter
   cache until filenames are content-hashed.
3. Verify a few image, font, and audio objects directly from the public domain.
4. Set `NEXT_PUBLIC_ASSET_BASE_URL=https://<public-r2-domain>` in the Next.js
   deployment and rebuild. Keep `NEXT_PUBLIC_PARTYKIT_HOST` set only to the
   hostname printed by `partykit deploy` (no R2 URL).
5. Do NOT remove local public assets: the `url()` references in
   `src/app/globals.css` (backgrounds + `@font-face` fonts — list them with
   `rg 'url\\("/(assets|fonts)/' src/app/globals.css`) cannot go through
   `assetUrl()` and stay same-origin by design, and keeping `public/` deployed
   makes unsetting the env var an instant, total rollback.
6. Deploy PartyKit before the app whenever `partykit.json` adds a party. The
   current worker must expose `/parties/lobbychat/directory`; the app now
   accesses it server-to-server through `/api/lobby-chat`, avoiding browser CORS
   failures.

## Verification checklist

- Two separate browsers see the same lobby message within one poll interval.
- Refreshing or waking the PartyKit object retains the bounded recent feed.
- Creating/joining a room still opens the WebSocket and syncs actions.
- Asset requests come from the R2 public domain with the expected content type;
  API and WebSocket requests never go to R2.
- With PartyKit unavailable, lobby chat returns a controlled 503 message while
  the lobby UI remains usable and retries on the next poll.
