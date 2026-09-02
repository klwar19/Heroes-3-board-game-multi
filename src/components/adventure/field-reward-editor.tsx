"use client";

/**
 * Shared designer first-clear reward editor: resources, Treasure dice,
 * Times × Search(X) per deck, plus special arms (morale, Ability Empower token,
 * Statistic empower, experience, movement, Resource dice). Used on center
 * hexes, tokens, objects, per-tile settlements and hex events.
 */

import {
  describeFieldReward,
  MAX_CENTER_HEX_DICE,
  MAX_CENTER_HEX_RESOURCE,
  MAX_CENTER_HEX_SEARCH,
  MAX_CENTER_HEX_SEARCH_TIMES,
  MAX_CENTER_HEX_VP,
  MAX_FIELD_REWARD_EXPERIENCE,
  MAX_FIELD_REWARD_MOVEMENT,
  MAX_FIELD_REWARD_RESOURCE_DICE,
  type CustomFieldReward
} from "@/engine";

const RESOURCE_FIELDS: {
  key: keyof Pick<CustomFieldReward, "gold" | "buildingMaterials" | "valuables">;
  label: string;
  max: number;
}[] = [
  { key: "gold", label: "Gold", max: MAX_CENTER_HEX_RESOURCE },
  { key: "buildingMaterials", label: "Materials", max: MAX_CENTER_HEX_RESOURCE },
  { key: "valuables", label: "Valuables", max: MAX_CENTER_HEX_RESOURCE }
];

const SEARCH_FIELDS: {
  sizeKey: "searchSpell" | "searchAbility" | "searchArtifact";
  timesKey: "searchSpellTimes" | "searchAbilityTimes" | "searchArtifactTimes";
  label: string;
}[] = [
  { sizeKey: "searchSpell", timesKey: "searchSpellTimes", label: "Spells" },
  { sizeKey: "searchAbility", timesKey: "searchAbilityTimes", label: "Abilities" },
  { sizeKey: "searchArtifact", timesKey: "searchArtifactTimes", label: "Artifacts" }
];

/**
 * Fold one amount into a field reward, returning the next reward (or undefined
 * when empty). Pure so handlers stay one-liners.
 */
export function nextFieldReward(
  current: CustomFieldReward | undefined,
  key: keyof CustomFieldReward,
  amount: number
): CustomFieldReward | undefined {
  const next: CustomFieldReward = { ...(current ?? {}) };
  if (amount > 0) {
    (next as Record<string, number>)[key] = amount;
  } else {
    delete (next as Record<string, number | undefined>)[key];
  }
  // Drop orphan times when the matching size is cleared.
  if (key === "searchSpell" && amount <= 0) delete next.searchSpellTimes;
  if (key === "searchAbility" && amount <= 0) delete next.searchAbilityTimes;
  if (key === "searchArtifact" && amount <= 0) delete next.searchArtifactTimes;
  // Don't store times === 1 (legacy lean shape).
  if (
    (key === "searchSpellTimes" || key === "searchAbilityTimes" || key === "searchArtifactTimes") &&
    amount <= 1
  ) {
    delete (next as Record<string, number | undefined>)[key];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Set or clear a boolean special arm (Ability Empower token / Statistic empower). */
export function nextFieldRewardFlag(
  current: CustomFieldReward | undefined,
  key: "abilityEmpowerToken" | "empowerStatistic",
  on: boolean
): CustomFieldReward | undefined {
  const next: CustomFieldReward = { ...(current ?? {}) };
  if (on) {
    next[key] = true;
  } else {
    delete next[key];
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Set morale to +1 / −1 / off. */
export function nextFieldRewardMorale(
  current: CustomFieldReward | undefined,
  value: 1 | -1 | 0
): CustomFieldReward | undefined {
  const next: CustomFieldReward = { ...(current ?? {}) };
  if (value === 1 || value === -1) {
    next.morale = value;
  } else {
    delete next.morale;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function FieldRewardEditor({
  reward,
  onChange,
  vp,
  onVpChange,
  showVp = true,
  ariaLabel = "First-clear reward"
}: {
  reward: CustomFieldReward | undefined;
  onChange: (reward: CustomFieldReward | undefined) => void;
  vp?: number;
  onVpChange?: (vp: number | undefined) => void;
  showVp?: boolean;
  ariaLabel?: string;
}) {
  const summary = describeFieldReward(reward);
  const vpPart = showVp && (vp ?? 0) > 0 ? `+${vp} VP` : "";
  const fullSummary = [summary, vpPart].filter(Boolean).join(" · ");

  return (
    <div className="fieldRewardEditor" role="group" aria-label={ariaLabel}>
      <div className="popoverViiRewardRow fieldRewardResourceRow">
        {RESOURCE_FIELDS.map((field) => (
          <label className="popoverViiField_num" key={field.key}>
            <span>{field.label}</span>
            <input
              aria-label={`${ariaLabel} ${field.label}`}
              max={field.max}
              min={0}
              onChange={(event) => {
                const amount = Math.max(0, Math.min(field.max, Math.floor(Number(event.target.value) || 0)));
                onChange(nextFieldReward(reward, field.key, amount));
              }}
              type="number"
              value={reward?.[field.key] ?? ""}
            />
          </label>
        ))}
        <label className="popoverViiField_num">
          <span>Treasure dice</span>
          <input
            aria-label={`${ariaLabel} Treasure dice`}
            max={MAX_CENTER_HEX_DICE}
            min={0}
            onChange={(event) => {
              const amount = Math.max(
                0,
                Math.min(MAX_CENTER_HEX_DICE, Math.floor(Number(event.target.value) || 0))
              );
              onChange(nextFieldReward(reward, "treasureDice", amount));
            }}
            type="number"
            value={reward?.treasureDice ?? ""}
          />
        </label>
        {showVp && onVpChange ? (
          <label className="popoverViiField_num popoverViiVp">
            <span>Victory Pts</span>
            <input
              aria-label={`${ariaLabel} victory points`}
              max={MAX_CENTER_HEX_VP}
              min={0}
              onChange={(event) => {
                const next = Math.max(
                  0,
                  Math.min(MAX_CENTER_HEX_VP, Math.floor(Number(event.target.value) || 0))
                );
                onVpChange(next > 0 ? next : undefined);
              }}
              type="number"
              value={vp ?? ""}
            />
          </label>
        ) : null}
      </div>

      <div className="fieldRewardSearchGrid" role="group" aria-label={`${ariaLabel} deck searches`}>
        {SEARCH_FIELDS.map(({ sizeKey, timesKey, label }) => {
          const size = reward?.[sizeKey] ?? 0;
          const times = size > 0 ? (reward?.[timesKey] ?? 1) : 0;
          return (
            <div className="fieldRewardSearchCard" key={sizeKey}>
              <div className="fieldRewardSearchTitle">{label}</div>
              <label className="popoverViiField_num">
                <span>Search size (X)</span>
                <input
                  aria-label={`${ariaLabel} ${label} Search size`}
                  max={MAX_CENTER_HEX_SEARCH}
                  min={0}
                  onChange={(event) => {
                    const amount = Math.max(
                      0,
                      Math.min(MAX_CENTER_HEX_SEARCH, Math.floor(Number(event.target.value) || 0))
                    );
                    onChange(nextFieldReward(reward, sizeKey, amount));
                  }}
                  type="number"
                  value={size || ""}
                />
              </label>
              <label className="popoverViiField_num">
                <span>Times</span>
                <input
                  aria-label={`${ariaLabel} ${label} Search times`}
                  disabled={size <= 0}
                  max={MAX_CENTER_HEX_SEARCH_TIMES}
                  min={1}
                  onChange={(event) => {
                    const amount = Math.max(
                      1,
                      Math.min(MAX_CENTER_HEX_SEARCH_TIMES, Math.floor(Number(event.target.value) || 1))
                    );
                    onChange(nextFieldReward(reward, timesKey, amount));
                  }}
                  type="number"
                  value={size > 0 ? times : ""}
                />
              </label>
              {size > 0 ? (
                <small className="fieldRewardSearchPreview">
                  {times > 1 ? `${times}× Search(${size})` : `Search(${size})`}
                </small>
              ) : (
                <small className="fieldRewardSearchPreview muted">off</small>
              )}
            </div>
          );
        })}
      </div>

      <div className="fieldRewardSpecialSection" role="group" aria-label={`${ariaLabel} special rewards`}>
        <div className="fieldRewardSpecialTitle">Special rewards</div>
        <div className="fieldRewardSpecialGrid">
          <label className="fieldRewardSpecialSelect">
            <span>Morale</span>
            <select
              aria-label={`${ariaLabel} morale`}
              onChange={(event) => {
                const v = event.target.value;
                onChange(nextFieldRewardMorale(reward, v === "1" ? 1 : v === "-1" ? -1 : 0));
              }}
              value={reward?.morale === 1 ? "1" : reward?.morale === -1 ? "-1" : "0"}
            >
              <option value="0">None</option>
              <option value="1">+1 morale</option>
              <option value="-1">−1 morale</option>
            </select>
          </label>

          <label className="fieldRewardSpecialToggle">
            <input
              aria-label={`${ariaLabel} Ability Empower token`}
              checked={Boolean(reward?.abilityEmpowerToken)}
              onChange={(event) =>
                onChange(nextFieldRewardFlag(reward, "abilityEmpowerToken", event.target.checked))
              }
              type="checkbox"
            />
            <span>
              Ability Empower token
              <small>Stackable · spend one anytime on a hand Ability</small>
            </span>
          </label>

          <label className="fieldRewardSpecialToggle">
            <input
              aria-label={`${ariaLabel} Empower a Statistic`}
              checked={Boolean(reward?.empowerStatistic)}
              onChange={(event) =>
                onChange(nextFieldRewardFlag(reward, "empowerStatistic", event.target.checked))
              }
              type="checkbox"
            />
            <span>
              Empower a Statistic
              <small>Free menu: hand or discard → Empowered form</small>
            </span>
          </label>

          <label className="popoverViiField_num">
            <span>Experience</span>
            <input
              aria-label={`${ariaLabel} experience`}
              max={MAX_FIELD_REWARD_EXPERIENCE}
              min={0}
              onChange={(event) => {
                const amount = Math.max(
                  0,
                  Math.min(MAX_FIELD_REWARD_EXPERIENCE, Math.floor(Number(event.target.value) || 0))
                );
                onChange(nextFieldReward(reward, "experience", amount));
              }}
              type="number"
              value={reward?.experience ?? ""}
            />
          </label>

          <label className="popoverViiField_num">
            <span>Movement</span>
            <input
              aria-label={`${ariaLabel} movement`}
              max={MAX_FIELD_REWARD_MOVEMENT}
              min={0}
              onChange={(event) => {
                const amount = Math.max(
                  0,
                  Math.min(MAX_FIELD_REWARD_MOVEMENT, Math.floor(Number(event.target.value) || 0))
                );
                onChange(nextFieldReward(reward, "movement", amount));
              }}
              type="number"
              value={reward?.movement ?? ""}
            />
          </label>

          <label className="popoverViiField_num">
            <span>Resource dice</span>
            <input
              aria-label={`${ariaLabel} Resource dice`}
              max={MAX_FIELD_REWARD_RESOURCE_DICE}
              min={0}
              onChange={(event) => {
                const amount = Math.max(
                  0,
                  Math.min(MAX_FIELD_REWARD_RESOURCE_DICE, Math.floor(Number(event.target.value) || 0))
                );
                onChange(nextFieldReward(reward, "resourceDice", amount));
              }}
              type="number"
              value={reward?.resourceDice ?? ""}
            />
          </label>
        </div>
      </div>

      {fullSummary ? (
        <small className="fieldRewardSummary" aria-live="polite">
          {fullSummary}
        </small>
      ) : (
        <small className="popoverHint">
          No first-clear bonus yet — set resources, a Search, or a special reward above.
        </small>
      )}
    </div>
  );
}
