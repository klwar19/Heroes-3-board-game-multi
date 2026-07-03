/**
 * Process-wide AccountStore singleton with best-effort disk persistence — the
 * same globalThis-cached, tmpdir-backed pattern as game-room-store.ts, so
 * accounts survive dev-server restarts and idle host reclaims. Reads its config
 * from env; with none set it still runs (in-memory + console mailer), which is
 * what CI/tests get. Guest mode is unaffected: this store only matters once the
 * accounts feature flag turns the login wall on.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountStore, type AccountStoreSnapshot } from "./account-store";
import { createMailerFromEnv } from "./mailer";

declare global {
  var __homm3bgAccountStore: AccountStore | undefined;
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

/** Persist the whole store (called after any mutation via the API layer). */
export function persistAccounts(store: AccountStore): void {
  try {
    if (!existsSync(persistDir)) {
      mkdirSync(persistDir, { recursive: true });
    }
    writeFileSync(persistFile, JSON.stringify(store.toJSON()));
  } catch {
    // Persistence is opportunistic; the in-memory store keeps working.
  }
}

function build(): AccountStore {
  const store = new AccountStore({
    mailer: createMailerFromEnv(),
    baseUrl: process.env.HOMM3BG_PUBLIC_URL ?? "http://localhost:3000",
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
