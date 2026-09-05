import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import bundled from "./learned-policy.json";
import { replayPolicyBias, type ReplayPolicyModel } from "./replay-model";
import { learnedActionBias } from "./learned-policy";
import { chooseComputerAction } from "./policy";
import * as mapPolicy from "./map-policy";
import { createAdventureGameState } from "../adventure-setup";
import type { GameAction, PlayerVisibleState } from "../state";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const original = structuredClone(bundled);
afterEach(() => {
  Object.assign(bundled, original);
  vi.restoreAllMocks();
});

/**
 * BUILD/DEPLOY CONTRACT (audit 2026-09-05). `learned-policy.json` is a
 * COMMITTED artifact the runtime imports. Training is an explicit, reviewed
 * step — never a build or deploy step: hanging it off `prebuild` /
 * `predeploy:partykit` / `scripts/vercel-build.mjs` made a deploy depend on
 * Supabase credentials and network reachability, let two deploys of the SAME
 * commit ship different AI behaviour, and failed the build on any training
 * error (the trainer also imports `.ts` from a `.mjs`, which does not resolve
 * on Node 22).
 */
describe("ranked-policy training is never a build step", () => {
  const packageJson = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("exposes training only as an explicit script", () => {
    expect(packageJson.scripts["train:ranked"]).toContain(
      "train-ranked-policy.mjs",
    );
    for (const [name, command] of Object.entries(packageJson.scripts)) {
      if (name === "train:ranked") continue;
      expect(`${name}: ${command}`).not.toContain("train-ranked-policy");
    }
    // The npm lifecycle hooks specifically: `prebuild` fires on every
    // `npm run build`, `predeploy:partykit` on every edge deploy.
    expect(packageJson.scripts.prebuild).toBeUndefined();
    expect(packageJson.scripts["predeploy:partykit"]).toBeUndefined();
  });

  it("keeps the Vercel build wrapper free of training", () => {
    const wrapper = readFileSync(
      join(ROOT, "scripts", "vercel-build.mjs"),
      "utf8",
    );
    expect(wrapper).not.toMatch(/spawnSync\([^)]*train-ranked-policy/u);
    expect(wrapper.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n")).not.toContain("train-ranked-policy.mjs");
  });
});

/** A malformed / stale / absent model can never crash or bias a decision. */
describe("learned model sanitisation", () => {
  const context = {
    stage: "midgame",
    faction: "fortress",
    combat: "map",
    pressure: false,
  };
  const action = { type: "BUILD_STRUCTURE", buildingId: "fortress.city_hall" };
  const entry = { wins: 3, losses: 0, matches: 3, bias: 6 };
  const key =
    "midgame|fortress|map|stable|BUILD_STRUCTURE|fortress.city_hall||";

  it("only trusts a version-1 entry with enough matches and a finite bounded bias", () => {
    const model = (over: Partial<ReplayPolicyModel["weights"][string]>, rest: Partial<ReplayPolicyModel> = {}) =>
      ({ version: 1, matches: 9, samples: 9, weights: { [key]: { ...entry, ...over } }, ...rest }) as ReplayPolicyModel;
    // CONTROL: a well-formed entry really does bias.
    expect(replayPolicyBias(model({}), context, action)).toBe(6);
    expect(replayPolicyBias(model({}, { version: 2 }), context, action)).toBe(0);
    expect(replayPolicyBias(model({ matches: 2 }), context, action)).toBe(0);
    expect(replayPolicyBias(model({ bias: Number.NaN }), context, action)).toBe(0);
    expect(replayPolicyBias(model({ bias: Number.POSITIVE_INFINITY }), context, action)).toBe(0);
    // A hand-edited or future-trained weight can never exceed the band.
    expect(replayPolicyBias(model({ bias: 5_000 }), context, action)).toBe(8);
    expect(replayPolicyBias(model({ bias: -5_000 }), context, action)).toBe(-8);
    // An empty model (the file absent / never trained) is inert.
    expect(
      replayPolicyBias(
        { version: 1, matches: 0, samples: 0, weights: {} },
        context,
        action,
      ),
    ).toBe(0);
  });

  it("the bundled model never biases an action it has no evidence for", () => {
    const state = createAdventureGameState({
      seed: "learned-contract",
      playerCount: 2,
      events: false,
      rollFirstPlayer: false,
    });
    state.round = 5;
    const observation = {
      playerId: "p2",
      state: state as unknown as PlayerVisibleState,
      legalActions: [],
    };
    expect(
      learnedActionBias(observation, {
        type: "END_TURN",
        playerId: "p2",
      } as GameAction),
    ).toBe(0);
  });

  it("CONTROL: with no learned weights the chooser keeps the base decision", () => {
    const build = (buildingId: string) =>
      ({
        type: "BUILD_STRUCTURE",
        buildingId,
        playerId: "p2",
        townId: "town_p2",
      }) as GameAction;
    const preferred = build("fortress.city_hall");
    const other = build("fortress.dwelling_silver");
    const state = createAdventureGameState({
      seed: "learned-control",
      playerCount: 2,
      events: false,
      rollFirstPlayer: false,
    });
    state.round = 5;
    state.players.p2.factionId = "fortress";
    state.players.p2.resources.gold = 30;
    const observation = () => ({
      playerId: "p2",
      state: state as unknown as PlayerVisibleState,
      legalActions: [
        { label: "income", action: preferred },
        { label: "silver", action: other },
      ],
    });
    vi.spyOn(mapPolicy, "scoreMapAction").mockImplementation((_o, a) => ({
      score: a === other ? 602 : 600,
      policy: "test-close-building",
    }));
    Object.assign(bundled, { version: 1, matches: 0, samples: 0, weights: {} });
    expect(chooseComputerAction(observation())?.action).toEqual(other);
  });
});
