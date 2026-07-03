/**
 * Process-wide account backend selection + singletons.
 *
 * Two backends behind ONE `getAccountBackend()` (the routes' entry point):
 *
 *  - **Supabase/Postgres** (`SupabaseAccountStore`) — chosen when BOTH a
 *    Supabase URL (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL) and the
 *    server-only SUPABASE_SERVICE_ROLE_KEY are set. Every account, session
 *    and match result is a real table row, so identity survives restarts and
 *    is shared across serverless instances. This is the production path.
 *  - **Built-in** (`AccountStore`) — the in-memory + on-disk store, the same
 *    globalThis-cached, tmpdir-backed pattern as game-room-store.ts. Fine for
 *    a single long-lived server / dev / CI; on a multi-instance serverless
 *    host its file persistence is per-instance and ephemeral.
 *
 * With no env set at all the built-in store runs in memory with a console
 * mailer — what CI/tests get. Guest mode is unaffected either way: these
 * stores only matter once the accounts feature flag turns the login wall on.
 */
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomic } from "@/server/atomic-file";
import { AccountStore, type AccountStoreSnapshot } from "./account-store";
import type { AccountBackend } from "./backend";
import { createMailerFromEnv, shouldAutoConfirmAccounts } from "./mailer";
import { SupabaseAccountStore } from "./supabase-store";

declare global {
  var __homm3bgAccountStore: AccountStore | undefined;
  var __homm3bgSupabaseAccountStore: SupabaseAccountStore | undefined;
}

const persistDir = process.env.HOMM3BG_ACCOUNT_DIR ?? join(tmpdir(), "homm3bg-accounts");
const persistFile = join(persistDir, "accounts.json");

function loadSnapshot(): AccountStoreSnapshot | null {
  try {
    if (!existsSync(persistFile)) {
      return null;
    }
    return JSON.parse(readFileSync(persistFile, "utf8")) as AccountStoreSnapshot;
  } catch {
    return null;
  }
}

/**
 * Persist the whole store (called after any mutation via the API layer).
 * Atomic (temp file + rename): the accounts file is the platform's entire
 * user database, so a crash mid-write must never truncate it.
 */
export function persistAccounts(store: AccountStore): void {
  try {
    writeFileAtomic(persistFile, JSON.stringify(store.toJSON()));
  } catch {
    // Persistence is opportunistic; the in-memory store keeps working.
  }
}

function build(): AccountStore {
  const mailer = createMailerFromEnv();
  // Deployment policy (see shouldAutoConfirmAccounts): a server that cannot
  // DELIVER mail must not lock new players behind "check your inbox".
  const autoConfirm = shouldAutoConfirmAccounts(mailer.delivers);
  if (autoConfirm) {
    console.warn(
      "[accounts] No delivering mail transport configured — new registrations are AUTO-CONFIRMED. " +
        "Configure SMTP (HOMM3BG_SMTP_*) or an HTTP mail API (HOMM3BG_MAIL_API_KEY) to enable real email verification."
    );
  }
  const store = new AccountStore({
    mailer,
    autoConfirmNewAccounts: autoConfirm,
    // Unset ⇒ the email link falls back to the per-request origin (the deploy
    // doesn't have to know its own URL); set HOMM3BG_PUBLIC_URL to pin a canonical one.
    baseUrl: process.env.HOMM3BG_PUBLIC_URL,
    adminEmail: process.env.HOMM3BG_ADMIN_EMAIL
  });
  store.loadJSON(loadSnapshot());
  // A configured admin email should own the admin role even if the account was
  // created before the env var was set (idempotent bootstrap on boot).
  if (process.env.HOMM3BG_ADMIN_EMAIL) {
    store.promoteToAdminByEmail(process.env.HOMM3BG_ADMIN_EMAIL);
  }
  // Full admin bootstrap: with a nickname + email + password configured, ensure
  // a ready-to-use, confirmed admin account exists (created if missing, promoted
  // if already registered). Credentials come from the env, never the repo, so
  // there is no default password to leak. Persist the seed so it survives a
  // full cold restart even before the admin logs in.
  const adminNickname = process.env.HOMM3BG_ADMIN_NICKNAME;
  const adminPassword = process.env.HOMM3BG_ADMIN_PASSWORD;
  const adminEmail = process.env.HOMM3BG_ADMIN_EMAIL;
  if (adminNickname && adminPassword && adminEmail) {
    try {
      store.ensureAdminAccount({ nickname: adminNickname, email: adminEmail, password: adminPassword });
      persistAccounts(store);
    } catch {
      // Invalid admin env (e.g. a too-short password) — skip the bootstrap; the
      // app still runs, and the seed-admin script remains available.
    }
  }
  return store;
}

export function getAccountStore(): AccountStore {
  const store = globalThis.__homm3bgAccountStore ?? build();
  globalThis.__homm3bgAccountStore = store;
  return store;
}

// ---------------------------------------------------------------------------
// Backend selection (built-in vs Supabase/Postgres)
// ---------------------------------------------------------------------------

/** The Supabase connection from env, or null when not (fully) configured. */
export function supabaseConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): { url: string; serviceRoleKey: string } | null {
  const url = env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url, serviceRoleKey };
}

/** Which backend `getAccountBackend()` will hand out. */
export function accountsBackendKind(): "supabase" | "builtin" {
  return supabaseConfigFromEnv() ? "supabase" : "builtin";
}

function buildSupabase(config: { url: string; serviceRoleKey: string }): SupabaseAccountStore {
  const mailer = createMailerFromEnv();
  const autoConfirm = shouldAutoConfirmAccounts(mailer.delivers);
  if (autoConfirm) {
    console.warn(
      "[accounts] No delivering mail transport configured — new registrations are AUTO-CONFIRMED. " +
        "Configure SMTP (HOMM3BG_SMTP_*) or an HTTP mail API (HOMM3BG_MAIL_API_KEY) to enable real email verification."
    );
  }
  const store = new SupabaseAccountStore({
    url: config.url,
    serviceRoleKey: config.serviceRoleKey,
    mailer,
    autoConfirmNewAccounts: autoConfirm,
    baseUrl: process.env.HOMM3BG_PUBLIC_URL,
    adminEmail: process.env.HOMM3BG_ADMIN_EMAIL
  });
  // The same env-driven admin bootstrap the built-in store runs, done against
  // the database. Fire-and-forget: idempotent, and a transient DB error on boot
  // must not take the app down (the next boot retries).
  const adminNickname = process.env.HOMM3BG_ADMIN_NICKNAME;
  const adminPassword = process.env.HOMM3BG_ADMIN_PASSWORD;
  const adminEmail = process.env.HOMM3BG_ADMIN_EMAIL;
  if (adminNickname && adminPassword && adminEmail) {
    void store
      .ensureAdminAccount({ nickname: adminNickname, email: adminEmail, password: adminPassword })
      .catch((error) => console.error("[accounts] admin bootstrap failed:", error));
  } else if (adminEmail) {
    void store
      .promoteToAdminByEmail(adminEmail)
      .catch((error) => console.error("[accounts] admin email promotion failed:", error));
  }
  return store;
}

/**
 * The account backend the API routes talk to. Callers must `await` every
 * method (the built-in store's are synchronous, the Supabase store's async —
 * awaiting a plain value is a no-op, so one call-site shape serves both).
 */
export function getAccountBackend(): AccountBackend {
  const config = supabaseConfigFromEnv();
  if (config) {
    const store = globalThis.__homm3bgSupabaseAccountStore ?? buildSupabase(config);
    globalThis.__homm3bgSupabaseAccountStore = store;
    return store;
  }
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && !warnedSupabaseKeyMissing) {
    warnedSupabaseKeyMissing = true;
    console.warn(
      "[accounts] NEXT_PUBLIC_SUPABASE_URL is set but SUPABASE_SERVICE_ROLE_KEY is missing — " +
        "falling back to the built-in account store. Set the service-role key to use Supabase."
    );
  }
  return getAccountStore();
}

let warnedSupabaseKeyMissing = false;
