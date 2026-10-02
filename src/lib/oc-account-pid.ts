import { ocPublicId } from "@/engine/garrison/order-chaos/scores";

/**
 * The public id an account's rows carry on the Order & Chaos tally boards: a
 * hash of the account id (never the id itself). The server stamps it on every
 * row; a signed-in browser computes its own from its session profile to
 * highlight "you". Shared by both sides so they always agree.
 */
export function ocAccountPid(accountId: string): string {
  return ocPublicId(`acct:${accountId}`);
}
