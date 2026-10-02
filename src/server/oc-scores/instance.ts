/**
 * Which tally-board store the API uses: the Supabase table when the account
 * backend is Supabase (same env: a Supabase URL + SUPABASE_SERVICE_ROLE_KEY),
 * else the rows kept inside the built-in AccountStore (saved with it in
 * accounts.json). The boards always live next to the accounts they belong to.
 */
import { accountsBackendKind, getAccountStore, persistAccounts, supabaseConfigFromEnv } from "@/server/accounts/account-store-instance";
import { OcPostLimiter } from "./service";
import type { OcScoreStore } from "./store";
import { SupabaseOcScoreStore } from "./supabase-store";

declare global {
  var __homm3bgOcScoreStore: SupabaseOcScoreStore | undefined;
  var __homm3bgOcPostLimiter: OcPostLimiter | undefined;
}

export function getOcScoreStore(): OcScoreStore {
  const config = supabaseConfigFromEnv();
  if (config) {
    const store = globalThis.__homm3bgOcScoreStore ?? new SupabaseOcScoreStore(config);
    globalThis.__homm3bgOcScoreStore = store;
    return store;
  }
  return getAccountStore().ocScores;
}

/** After a post: the built-in store saves its snapshot (Supabase rows are written as they go). */
export function saveOcScores(): void {
  if (accountsBackendKind() === "builtin") persistAccounts(getAccountStore());
}

export function getOcPostLimiter(): OcPostLimiter {
  const limiter = globalThis.__homm3bgOcPostLimiter ?? new OcPostLimiter();
  globalThis.__homm3bgOcPostLimiter = limiter;
  return limiter;
}
