import { NextResponse } from "next/server";
import { sessionProfile } from "@/server/accounts/http";
import { getOcPostLimiter, getOcScoreStore, saveOcScores } from "@/server/oc-scores/instance";
import { OC_MAX_BODY, postOcRunForAccount, readOcBoard } from "@/server/oc-scores/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Order & Chaos tally boards (all modes, today / all-time), stored per account
 * like ranked MMR (src/server/oc-scores). Reading is public; posting needs a
 * signed-in account and the row shows that account's nickname.
 *
 * - GET  ?mode=endless|daily|raid|campaign&view=today|all[&raid=r3][&day=YYYY-MM-DD&setup=xxxxxxxx]
 *        → `{ ok, key, today, rows }`; the browser may reuse it for 10 s (the
 *        client fetches with no-store right after posting, so a post shows at once).
 * - POST `{ run }` (session cookie) → `{ ok, score, pid, name, today: {rank, best, improved}, all: {...} }`;
 *        401 `{ ok:false, signedOut:true }` without a session, 400 for a run the
 *        rules refuse, 429 inside the 5 s gap, 503 when the store can't be reached.
 */

const OFFLINE = "The tally board can't be reached right now.";

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

export async function GET(request: Request) {
  try {
    const { status, body } = await readOcBoard(getOcScoreStore(), new URL(request.url).searchParams);
    return NextResponse.json(body, { status, headers: status === 200 ? { "Cache-Control": "public, max-age=10" } : { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[oc-scores] board read failed:", error);
    return NextResponse.json({ ok: false, error: OFFLINE }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > OC_MAX_BODY) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 413 });
  }
  const text = await request.text().catch(() => "");
  if (!text || text.length > OC_MAX_BODY) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  try {
    const profile = await sessionProfile(request);
    if (!profile) {
      return NextResponse.json(
        { ok: false, signedOut: true, error: "Sign in to your Heroes 3 account to go on the tally board." },
        { status: 401 }
      );
    }
    const { status, body: out } = await postOcRunForAccount(
      getOcScoreStore(),
      { id: profile.id, nickname: profile.nickname },
      body,
      { limiter: getOcPostLimiter(), ip: clientIp(request) }
    );
    if (status === 200) saveOcScores();
    return NextResponse.json(out, { status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[oc-scores] post failed:", error);
    return NextResponse.json({ ok: false, error: OFFLINE }, { status: 503 });
  }
}
