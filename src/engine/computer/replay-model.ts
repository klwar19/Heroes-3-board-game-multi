/** Shared offline training/runtime feature contract. No private identities or map IDs. */
export type ReplayPolicyContext = {
  stage: string;
  faction: string;
  combat: string;
  pressure: boolean;
};
export type PolicyAction = {
  type: string;
  cardId?: string;
  unitDefId?: string | null;
  buildingId?: string;
  mode?: string;
  kind?: string;
};
export type ReplayPolicyModel = {
  version: number;
  matches: number;
  samples: number;
  weights: Record<
    string,
    { wins: number; losses: number; matches: number; bias: number }
  >;
};
export function replayPolicyKey(
  context: ReplayPolicyContext,
  action: PolicyAction,
): string | null {
  const identity = action.cardId ?? action.unitDefId ?? action.buildingId;
  if (!identity) return null;
  return [
    context.stage,
    context.faction,
    context.combat,
    context.pressure ? "pressure" : "stable",
    action.type,
    identity,
    action.mode ?? "",
    action.kind ?? "",
  ].join("|");
}
export function trainReplayPolicy(
  samples: Array<{
    matchId: string;
    context: ReplayPolicyContext;
    action: PolicyAction;
    outcome: "win" | "loss";
  }>,
  minimumMatches = 3,
): ReplayPolicyModel {
  const votes = new Map<string, Map<string, Set<string>>>();
  for (const sample of samples) {
    const key = replayPolicyKey(sample.context, sample.action);
    if (!key) continue;
    const matches = votes.get(key) ?? new Map<string, Set<string>>();
    const outcomes = matches.get(sample.matchId) ?? new Set<string>();
    outcomes.add(sample.outcome);
    matches.set(sample.matchId, outcomes);
    votes.set(key, matches);
  }
  const model: ReplayPolicyModel = {
    version: 1,
    matches: new Set(samples.map((s) => s.matchId)).size,
    samples: samples.length,
    weights: {},
  };
  for (const [key, matches] of [...votes].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const usable = [...matches.values()].filter((v) => v.size === 1);
    if (usable.length < minimumMatches) continue;
    const wins = usable.filter((v) => v.has("win")).length;
    const losses = usable.length - wins;
    // Symmetric prior shrinks sparse correlations. One match contributes once.
    const bias = Math.max(
      -8,
      Math.min(8, 24 * ((wins + 2) / (wins + losses + 4) - 0.5)),
    );
    model.weights[key] = { wins, losses, matches: usable.length, bias };
  }
  return model;
}
export function replayPolicyBias(
  model: ReplayPolicyModel,
  context: ReplayPolicyContext,
  action: PolicyAction,
): number {
  const key = replayPolicyKey(context, action);
  const entry = key ? model.weights[key] : undefined;
  return model.version === 1 &&
    entry &&
    entry.matches >= 3 &&
    Number.isFinite(entry.bias)
    ? Math.max(-8, Math.min(8, entry.bias))
    : 0;
}
