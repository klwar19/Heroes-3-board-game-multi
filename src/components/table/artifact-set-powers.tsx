"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { artifactSetDefinition, artifactSetIconImage, type GameAction, type LegalAction } from "@/engine";
import { assetUrl } from "@/lib/asset-url";

// ---------------------------------------------------------------------------
// Polish Set Artifacts — the COMBAT activation surface.
//
// The engine emits ONE offer per (power x legal target unit): a 6-piece Angelic
// Alliance with its pick made is 5 offers, and a Titan's Thunder zap is one per
// enemy unit. Rendered flat in the command dock that was a wall of look-alike
// buttons ("now too many boxes"), so the dock collapses every set offer behind
// ONE entry button that opens a window listing each distinct POWER once; a power
// with several unit targets ARMS the battlefield instead of listing its targets.
//
// This is PURE PRESENTATION over the engine's own offers. Nothing here invents,
// filters or re-derives an action: every dispatch is an offer object taken
// verbatim out of `legalActions`, so a rendered control can never be refused.
// ---------------------------------------------------------------------------

/** One distinct set POWER, with every target the engine offers for it. */
export type ArtifactSetPowerGroup = {
  /** Stable identity: the React key AND the id the board arming stores. */
  key: string;
  setId: string;
  setName: string;
  /** The tier's piece threshold — null for the selection tier (its action carries none). */
  threshold: number | null;
  /** What the power does, in the printed tier's own words. */
  text: string;
  /** Every engine offer in this group, in engine order. */
  offers: readonly LegalAction[];
  /** unitId -> that target's exact engine action. Empty ⇒ a target-less power. */
  targets: ReadonlyMap<string, GameAction>;
};

type MutableGroup = Omit<ArtifactSetPowerGroup, "offers" | "targets"> & {
  offers: LegalAction[];
  targets: Map<string, GameAction>;
};

/**
 * Group the engine's set-artifact offers by the POWER they activate.
 *
 * Pure and exported so the "one row per power" rule is testable apart from the
 * JSX. Every offer lands in exactly one group, so nothing the engine offers can
 * be dropped on the floor by the grouping itself.
 */
export function artifactSetPowerGroups(legalActions: readonly LegalAction[]): ArtifactSetPowerGroup[] {
  const groups = new Map<string, MutableGroup>();
  for (const legal of legalActions) {
    const action = legal.action;
    let key: string;
    let setId: string;
    let threshold: number | null;
    let unitId: string | undefined;
    if (action.type === "SELECT_ARTIFACT_SET_UNIT") {
      // A set prints at most one "select 1 unit" tier, so the set id alone is a
      // unique key (the action carries no threshold to key on).
      setId = action.setId;
      threshold = null;
      unitId = action.unitId;
      key = `select:${setId}`;
    } else if (action.type === "USE_ARTIFACT_SET_POWER") {
      setId = action.setId;
      threshold = action.tier;
      unitId = action.unitId;
      // The Diplomat's Cloak scry offers one action per Neutral deck at the SAME
      // tier — each is its own power row, never a "pick a target" arming.
      key = `use:${setId}:${action.tier}${action.neutralTier ? `:${action.neutralTier}` : ""}`;
    } else {
      continue;
    }

    let group = groups.get(key);
    if (!group) {
      const definition = artifactSetDefinition(setId);
      const tier =
        threshold === null
          ? definition?.tiers.find((entry) => entry.effect.kind === "select-unit")
          : definition?.tiers.find((entry) => entry.threshold === threshold);
      group = {
        key,
        setId,
        setName: definition?.name ?? setId,
        threshold: threshold ?? tier?.threshold ?? null,
        // The printed tier line is the honest description; the engine label is
        // the fallback (and, for a target-less power, the better text — it names
        // the deck / the exact hand step).
        text: tier?.text ?? legal.label,
        offers: [],
        targets: new Map()
      };
      groups.set(key, group);
    }
    group.offers.push(legal);
    if (unitId) {
      group.targets.set(unitId, action);
    }
  }
  const list = [...groups.values()];
  for (const group of list) {
    if (group.targets.size === 0 && group.offers.length === 1) {
      group.text = group.offers[0].label;
    }
  }
  return list;
}

// ---------------------------------------------------------------------------
// Board arming — shared between the command dock (which arms) and the
// battlefield (which lights the targets up and dispatches).
// ---------------------------------------------------------------------------

type ArtifactSetArming = {
  /** The armed power's group key, or null. */
  armedKey: string | null;
  arm: (key: string) => void;
  disarm: () => void;
};

const ArtifactSetArmingContext = createContext<ArtifactSetArming | null>(null);

/**
 * Publish ONE arming slot to the dock and the battlefield below. Mounted by
 * `ArtifactSetIconsProvider`, i.e. exactly once per table screen, so the two
 * surfaces cannot disagree about what is armed.
 */
export function ArtifactSetArmingProvider({ children }: { children: ReactNode }) {
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const disarm = useCallback(() => setArmedKey(null), []);
  const value = useMemo<ArtifactSetArming>(
    () => ({ armedKey, arm: setArmedKey, disarm }),
    [armedKey, disarm]
  );
  return <ArtifactSetArmingContext.Provider value={value}>{children}</ArtifactSetArmingContext.Provider>;
}

/**
 * The shared arming slot when a provider is above (the real table), else a
 * component-local one — so a component rendered in isolation still works, and a
 * test that wants the dock and the board to share MUST wrap both in the
 * provider, exactly as page.tsx does.
 */
export function useArtifactSetArming(): ArtifactSetArming {
  const shared = useContext(ArtifactSetArmingContext);
  const [localKey, setLocalKey] = useState<string | null>(null);
  const localDisarm = useCallback(() => setLocalKey(null), []);
  const local = useMemo<ArtifactSetArming>(
    () => ({ armedKey: localKey, arm: setLocalKey, disarm: localDisarm }),
    [localKey, localDisarm]
  );
  return shared ?? local;
}

// ---------------------------------------------------------------------------
// The dock entry button + its window
// ---------------------------------------------------------------------------

function SetPowerIcon({ setId, setName }: { setId: string; setName: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="setPowerIcon"
      data-set-id={setId}
      decoding="async"
      draggable={false}
      loading="lazy"
      src={assetUrl(artifactSetIconImage(setId))}
      title={setName}
    />
  );
}

function ArtifactSetPowerWindow({
  groups,
  onArm,
  onClose,
  onAction
}: {
  groups: readonly ArtifactSetPowerGroup[];
  onArm: (key: string) => void;
  onClose: () => void;
  onAction: (action: GameAction) => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const body = (
    // `theme-classic` supplies the mod-window CSS vars (--mod-line/--mod-panel/
    // --mod-art) the shared shell is styled from; Set Artifacts is a Polish
    // (classic) house rule, so it always wears the classic register.
    <div className="heroSystemBackdrop setPowerBackdrop theme-classic" onMouseDown={onClose}>
      <section
        aria-label="Artifact set powers"
        aria-modal="true"
        className="heroSystemModal setPowerWindow"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <small>Polish Set Artifacts · this combat</small>
            <h2>Set powers</h2>
          </div>
          <button aria-label="Close set powers" className="heroSystemClose" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>
        <p className="setPowerHint">
          Pick a power. A power that can aim at several units closes this window and lights those units up on the
          battlefield — click one to use it.
        </p>
        <div className="setPowerList">
          {groups.map((group) => {
            const targetCount = group.targets.size;
            const single = targetCount <= 1 ? group.offers[0] : null;
            const label = single
              ? single.label
              : `${group.setName}: ${group.text} — choose one of ${targetCount} units on the battlefield`;
            return (
              <button
                aria-label={label}
                className="setPowerRow"
                data-power-key={group.key}
                key={group.key}
                onClick={() => {
                  if (single) {
                    onAction(single.action);
                    onClose();
                    return;
                  }
                  onArm(group.key);
                  onClose();
                }}
                title={label}
                type="button"
              >
                <SetPowerIcon setId={group.setId} setName={group.setName} />
                <span className="setPowerRowText">
                  <strong>{group.setName}</strong>
                  <span className="setPowerRowEffect">{group.text}</span>
                  <span className="setPowerRowMeta">
                    {group.threshold === null ? "start of the combat" : `${group.threshold} pieces`}
                    {targetCount > 1 ? ` · pick 1 of ${targetCount} units on the board` : ""}
                    {targetCount === 1 ? " · 1 target" : ""}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );

  return typeof document === "undefined" ? body : createPortal(body, document.body);
}

/**
 * The dock's single set-artifacts entry. Renders NOTHING when the engine offers
 * no set activation (a default table, the rule off, or every tier already
 * spent), so the dock is byte-identical to before in every other game.
 */
export function ArtifactSetPowerMenu({
  legalActions,
  onAction
}: {
  legalActions: readonly LegalAction[];
  onAction: (action: GameAction) => void;
}) {
  const groups = useMemo(() => artifactSetPowerGroups(legalActions), [legalActions]);
  const arming = useArtifactSetArming();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Nothing left to activate (the last tier was used, the combat ended) — never
  // leave an empty window on screen, and never let a stale `open` flag pop it
  // back up when a new offer appears. Reset during render (the repo's
  // adjust-state-on-change pattern, as in the board's expert-Tactics arming),
  // so the close commits in the same render the offers vanish.
  if (groups.length === 0) {
    if (open) {
      setOpen(false);
    }
    return null;
  }

  const armedGroup = arming.armedKey ? groups.find((group) => group.key === arming.armedKey) ?? null : null;

  return (
    <>
      <button
        className="commandButton setPowerButton"
        onClick={() => setOpen(true)}
        title="Polish Set Artifacts — the powers your active sets can use in this combat"
        type="button"
      >
        <SetPowerIcon setId={groups[0].setId} setName={groups[0].setName} />
        Set powers ({groups.length})
      </button>
      {armedGroup ? (
        <button
          className="commandButton setPowerCancelButton"
          onClick={arming.disarm}
          title="Stop aiming this set power"
          type="button"
        >
          Cancel {armedGroup.setName}
        </button>
      ) : null}
      {open ? (
        <ArtifactSetPowerWindow groups={groups} onAction={onAction} onArm={arming.arm} onClose={close} />
      ) : null}
    </>
  );
}
