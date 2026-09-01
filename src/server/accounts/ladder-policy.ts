/** Exact operator-designated proof/load accounts: never rank or count games. */
const LADDER_EXEMPT_NICKNAMES = new Set(
  [
    "R1ProofA8160618",
    "ProofA1788188791",
    "ProofB1788188791",
    "R1BattleA8170184",
    "R1ProofB8160618",
    "R1LiveA8160074"
  ].map((nickname) => nickname.toLowerCase())
);
export const LADDER_EXEMPT_NICKNAME_COUNT = LADDER_EXEMPT_NICKNAMES.size;

export function isLadderExemptNickname(nickname: string): boolean {
  return LADDER_EXEMPT_NICKNAMES.has(nickname.trim().replace(/\s+/g, " ").toLowerCase());
}
