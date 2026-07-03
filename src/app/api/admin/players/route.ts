import { NextResponse } from "next/server";
import { getAccountStore } from "@/server/accounts/account-store-instance";
import { errorResponse, requireAdmin, save } from "@/server/accounts/http";
import { AccountError } from "@/server/accounts/types";

export const dynamic = "force-dynamic";

/** Admin-only roster (includes emails). Non-admins get 403 (control tested). */
export async function GET(request: Request) {
  try {
    requireAdmin(request);
    return NextResponse.json({ players: getAccountStore().adminListAccounts() });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Admin moderation actions. Body: { action, accountId, reason?, role? }.
 * `ban` / `unban` / `delete` / `setRole`. An admin cannot delete or demote
 * themselves in the same call (avoids locking the platform out of admins).
 */
export async function POST(request: Request) {
  try {
    const admin = requireAdmin(request);
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      accountId?: string;
      reason?: string;
      role?: string;
    };
    const store = getAccountStore();
    const accountId = typeof body.accountId === "string" ? body.accountId : "";
    if (!accountId) {
      throw new AccountError("NOT_FOUND", "No account specified.");
    }
    const selfTarget = accountId === admin.id;

    switch (body.action) {
      case "ban": {
        if (selfTarget) {
          throw new AccountError("FORBIDDEN", "You cannot ban yourself.");
        }
        const profile = store.banAccount(accountId, body.reason);
        save();
        return NextResponse.json({ profile });
      }
      case "unban": {
        const profile = store.unbanAccount(accountId);
        save();
        return NextResponse.json({ profile });
      }
      case "delete": {
        if (selfTarget) {
          throw new AccountError("FORBIDDEN", "You cannot delete your own admin account here.");
        }
        store.deleteAccount(accountId);
        save();
        return NextResponse.json({ ok: true });
      }
      case "setRole": {
        if (body.role !== "admin" && body.role !== "player") {
          throw new AccountError("FORBIDDEN", "Unknown role.");
        }
        if (selfTarget && body.role === "player") {
          throw new AccountError("FORBIDDEN", "You cannot remove your own admin role.");
        }
        const profile = store.setRole(accountId, body.role);
        save();
        return NextResponse.json({ profile });
      }
      default:
        throw new AccountError("FORBIDDEN", "Unknown admin action.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
