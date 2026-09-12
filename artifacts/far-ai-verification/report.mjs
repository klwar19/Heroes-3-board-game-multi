import { readFileSync, writeFileSync } from "node:fs";
const folder = "artifacts/far-ai-verification";
const read = name => JSON.parse(readFileSync(`${folder}/${name}.json`, "utf8"));
const factions = ["necropolis", "castle", "conflux"];
const income = f => f.group === "far" && (f.location === "settlement" ||
  (f.location === "mine" && ["gold", "valuables"].includes(f.resource)));
const label = f => f.location === "mine" ? `${f.resource} mine` : f.location;
const rows = [];
for (const difficulty of ["impossible", "hard", "normal"]) for (const faction of factions) {
  const r = read(`current-${difficulty}-${faction}`);
  const attacks = r.attacks.filter(income);
  const captures = r.captures.filter(income);
  rows.push(`| ${difficulty} | ${faction} | ${attacks[0] ? `R${attacks[0].round}, ${attacks[0].entryMp} MP` : "none"} | ${captures.map(c => `R${c.round} ${label(c)}`).join("; ")} |`);
}
const report = `# FAR economy AI verification — 2026-09-12

Implemented locally; no deployment or commit performed. User explicitly authorized these focused gameplay runs. The repository's default test/simulation runners remain disabled.

## Behavior

- Three Bronze Packs qualify for FAR II–III settlement/gold/valuables attacks on Impossible; Silver is not required. Paid Impossible II–III economy entry needs three MP (entry plus two continuations). Easier II–III fights reserve one continuation; free/automatic wins need no paid continuation reserve.
- The planner selects a reachable settlement first within the round-4 window, otherwise the timely gold/valuable mine. From round 3 a full Bronze core prioritizes this over leftover home rewards. It stages adjacent rather than spending the attack reserve on entry.
- After the first holding, the missing economy type is prioritized; remaining useful FAR income remains ahead of generic NEAR expansion. One-use peaceful visits can be resolved as intermediate steps of this specific economy route. Shared engine movement legality is unchanged.
- Stable pickup commitment fixes the observed Conflux A–B–A–B route. Detours cannot increase distance from the committed premium objective.
- Silver recruits require surplus after the development reserve; pre-capture Silver construction preserves gold for remaining Bronze upgrades and a five-gold cushion. Wisdom purchases protect the next recruit fund. Second heroes require a captured FAR economy holding, affordable reserve, and concrete nearby jobs.

## Actual authoritative gameplay

These are deterministic runner/reducer games, not score-only checks. Seeds are far-timing-FACTION-1. Two FAR supply tiles, default starting armies/resources, skirmish, optional Events off, paid neutral continuation on, Polish Quick Combat off, passive human map opponent. Ordinary single-player first-two I/II guaranteed wins remain part of that mode; all listed III attacks resolve actual combat. No human took part in these automated battles.

| Setting | Town | First FAR attack | Captures observed |
|---|---|---|---|
${rows.join("\n")}

Impossible runs continue through round 8; final Hard/Normal comparisons through round 6. Latest Impossible runs captured both FAR objectives, entered paid economy battles with three MP, and had no consecutive A–B–A–B movement cycle. Castle recruited Archangels in R7 and Champions in R8. All three built the Gold dwelling in R7. Necropolis and Conflux still lacked a Gold army by R8: those two assertions remain FAILED. Earlier failures and pre-fix runs are retained in eight-round-runs/, reserve-only/, first-r4-capture/, and pre-sticky-fix/.

## Human-controlled neutral setting

Eighteen controlled scenarios cover Necropolis/Castle/Conflux × settlement/gold/valuables × must-attack on/off. Each starts with three intact Bronze Packs, R4, three MP and an adjacent objective. Every case enters the actual battle, leaves two MP, and assigns neutral input to the human seat. Three additional automatic-guard Impossible scenarios actually captured the settlement with that army and budget.

Full multiplayer/parallel games also exercised the human input path, with legal neutral decisions supplied by the test harness rather than a real person. Conflux attacked and captured in R4. Necropolis and Castle missed R4 after casualties in home fights: at R4 they held two Packs plus one Few and only three gold. These failures are retained; the result is not a guarantee of R4 after arbitrary losses or map obstruction. This does not claim victory against every human strategy.

## Controls and mutations

Relevant current controls passed; removing the listed logic changes an observable action/capture and fails:

| Removed behavior | Failure observed |
|---|---|
| Impossible three-MP reserve | Settlement/gold/valuables entered with only two MP |
| Impossible FAR three-Pack eligibility | All three towns refuse the R4 fight, including human-control toggles |
| Deadline priority over home reward | Home treasure taken instead of R4 FAR settlement |
| Peaceful intermediate route | Necropolis fails to capture the second FAR holding |
| Stable pickup commitment | Conflux repeats A–B–A–B and misses second FAR capture |
| Silver reserve | Tight-budget control buys Silver |
| Second-hero capture prerequisite | Hero hired before first FAR capture |
| Spell reserve | Wisdom spends the first Gold recruit fund |
| Paid-bank reserve | Bank entered on last MP |
| Early feasible market conversion | R2 Silver dwelling not built |
| Settlement priority | Competing gold mine entered instead of settlement |
| Easier two-MP entry | Conflux cannot enter/capture the R2 settlement |

The original Hard R2 two-MP scenarios retain two failed capture outcomes (Necropolis/Castle); Conflux succeeds. They select the intended target, but a single continuation did not finish those guard draws. Expectations and seeds were not changed to hide those losses.

## Reproduction and artifacts

Run only the requested files via the isolated configuration:

\`node node_modules/vitest/vitest.mjs run --config artifacts/far-ai-verification/vitest.config.mts artifacts/far-ai-verification/gameplay.test.ts\`

Environment controls: AI_DIFFICULTY=impossible/hard/normal; optional AI_FACTION; AI_MAX_ROUND=6 for the six-round objective checks (default 8 retains the Gold-army checkpoint); AI_HUMAN_NEUTRALS=free/must enables parallel human-neutral input. AI_POLICY_VARIANT selects isolated source mutations or before (HEAD source preserved as .ts.txt). Mutations do not edit production files.

Detailed actions, resources, attacks, remaining MP, outcomes, captures, and final map are in the corresponding JSON files. Console reports are in final-*.log and mutation-*.log. TypeScript and ESLint checks are recorded separately. Scope is these towns and seeded scenarios, not a broad balance or stress suite.
`;
writeFileSync(`${folder}/REPORT.md`, report);
