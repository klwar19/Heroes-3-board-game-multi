/**
 * Promote a registered account to the admin role (expansion plan Phase 1, §9).
 * No credentials ever live in the repo — the owner registers their account in
 * the app, then runs this once against the server's account store:
 *
 *   # Use the SAME HOMM3BG_ACCOUNT_DIR the server runs with (default: a temp
 *   # dir under the OS tmpdir — set it explicitly in production).
 *   HOMM3BG_ACCOUNT_DIR=/var/lib/homm3bg/accounts \
 *     npx tsx scripts/seed-admin.ts you@example.com
 *
 * The account-store singleton loads the on-disk snapshot, this promotes the
 * matching email, and the change is persisted back. Alternatively, set the
 * HOMM3BG_ADMIN_EMAIL env var on the server — that email is auto-promoted on
 * registration and on every boot.
 *
 * The accounts module tree is pure relative imports + Node built-ins (no `@/`
 * alias, no Next.js), so this runs under `tsx`/`ts-node` without extra config.
 */
import { getAccountStore, persistAccounts } from "../src/server/accounts/account-store-instance";

const email = process.argv[2];
if (!email) {
  console.error("Usage: tsx scripts/seed-admin.ts <email>");
  process.exit(1);
}

const store = getAccountStore();
const profile = store.promoteToAdminByEmail(email);
if (!profile) {
  console.error(`No account found for ${email}. Register that email in the app first, then re-run.`);
  process.exit(1);
}
persistAccounts(store);
console.log(`Promoted ${profile.nickname} <${email}> to admin.`);
