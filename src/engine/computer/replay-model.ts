/** Shared offline training/runtime feature contract. No private identities or map IDs. */
export type ReplayPolicyContext = {
  stage: string;
  faction: string;
  combat: string;
  pressure: boolean;
  /** Optional for legacy captures; never infer disabled rules from missing data. */
  conditions?: string;
  situation?: string;
};
export type PolicyAction = {
  type: string;
  cardId?: string;
  unitDefId?: string | null;
  buildingId?: string;
  mode?: string;
  kind?: string;
  abilityId?: string;
  optionIndex?: number | null;
  asPowerBoost?: boolean;
  drawOnly?: boolean;
  stat?: string;
  stance?: string;
  tier?: string | number;
  fromSpellBook?: boolean;
  takeCastCard?: boolean;
  rollSpell?: { cardId: string };
  wisdom?: { cardId: string; mode?: string };
  slot?: string | number;
  position?: number;
  objective?: string;
  tacticalTarget?: string;
  purchases?: ReadonlyArray<{ unitDefId: string; kind: string }>;
  pick?: { kind: string; index?: number; cardId?: string; remove?: boolean };
};

/** Both training and live selection resolve search indices through the actual
 * revealed cards. A raw option index is never a card identity. */
export function describeReplayAction(action: PolicyAction, revealed?: readonly string[]): PolicyAction {
  if (action.type !== "RESOLVE_DECK_SEARCH") return action;
  const cardId = action.pick?.kind === "revealed"
    ? revealed?.[action.pick.index ?? -1] : action.pick?.cardId;
  return { ...action, cardId };
}
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
  const identity = action.cardId ?? action.unitDefId ?? action.buildingId ?? action.abilityId ?? action.stat ?? action.stance ?? action.objective ??
    action.rollSpell?.cardId ??
    action.wisdom?.cardId ??
    (action.purchases?.length ? action.purchases.map((purchase) =>
      `${purchase.kind}:${purchase.unitDefId}`).sort().join(",") : undefined) ??
    // Payload-free commander/Book actions may key on their type alone. Types
    // whose real decision lives in an unlisted field must stay out: a raw
    // COMMANDER_FIRST_AID option index is never a target identity.
    (/COMMANDER|SPELL_BOOK/.test(action.type) && action.type !== "COMMANDER_FIRST_AID"
      ? action.type : undefined);
  if (!identity) return null;
  const key = [
    context.stage,
    context.faction,
    context.combat,
    context.pressure ? "pressure" : "stable",
    action.type,
    identity,
    action.mode ?? "",
    action.kind ?? "",
  ].join("|");
  // Keep distinct uses distinct: casting Magic Arrow and burning it for Power,
  // or two choices of one artifact, must never receive the same outcome vote.
  return key + (action.asPowerBoost ? "|power-fuel" : "") +
    (action.drawOnly ? "|draw-only" : "") +
    (action.fromSpellBook ? "|book-cast" : "") +
    (action.takeCastCard ? "|cast-enabler" : "") +
    (action.rollSpell ? "|roll-spell" : "") +
    (action.wisdom ? `|wisdom:${action.wisdom.mode ?? "basic"}` : "") +
    (action.slot !== undefined ? `|slot:${action.slot}` : "") +
    (action.position !== undefined ? `|pos:${action.position}` : "") +
    (action.tier ? `|tier:${action.tier}` : "") +
    (action.tacticalTarget ? `|target:${action.tacticalTarget}` : "") +
    (action.pick?.remove ? "|remove-pick" : "") +
    (action.optionIndex != null ? `|option:${action.optionIndex}` : "") +
    (context.conditions ? `|rules:${context.conditions}` : "") +
    (context.situation ? `|situation:${context.situation}` : "");
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
    const keys = new Set([
      replayPolicyKey(sample.context, sample.action),
      replayPolicyKey({ ...sample.context, situation: undefined }, sample.action),
      replayPolicyKey({ ...sample.context, situation: undefined }, { ...sample.action, tacticalTarget: undefined }),
    ]);
    for (const key of keys) {
      if (!key) continue;
      const matches = votes.get(key) ?? new Map<string, Set<string>>();
      const outcomes = matches.get(sample.matchId) ?? new Set<string>();
      outcomes.add(sample.outcome);
      matches.set(sample.matchId, outcomes);
      votes.set(key, matches);
    }
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
  const fallback = replayPolicyKey({ ...context, situation: undefined }, action);
  const broad = replayPolicyKey({ ...context, situation: undefined }, { ...action, tacticalTarget: undefined });
  const entry = (key ? model.weights[key] : undefined) ?? (fallback ? model.weights[fallback] : undefined) ??
    (broad ? model.weights[broad] : undefined);
  return model.version === 1 &&
    entry &&
    entry.matches >= 3 &&
    Number.isFinite(entry.bias)
    ? Math.max(-8, Math.min(8, entry.bias))
    : 0;
}
