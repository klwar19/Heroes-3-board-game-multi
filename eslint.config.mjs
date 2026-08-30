import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  // Claude-managed worktrees are independent checkouts, not source owned by
  // this checkout. Scanning them duplicates the project and can report stale
  // errors from another branch.
  { ignores: [".claude/worktrees/**"] },
  ...nextVitals,
  ...nextTs
];

export default eslintConfig;
