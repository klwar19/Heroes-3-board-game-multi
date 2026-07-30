export type SnapshotSource =
  | "connect"
  | "broadcast"
  | "action-ack"
  | "sync"
  | "http-recovery"
  /**
   * A deliberate divergence-recovery refetch (the client's action was REJECTED
   * although its own state computed it legal). Unlike every other source it may
   * re-commit a frame at the version the arbiter already holds — on a hosted
   * room every broadcast is seat-authoritative, so the one-shot seat-upgrade
   * latch is always spent and an equal-version recovery frame would otherwise
   * be dropped as "duplicate", leaving a content-diverged client frozen with
   * every click rejected. Bounded to once per version (resyncVersion latch).
   */
  | "resync"
  | "reset";

export type SnapshotArbiterState = {
  bootId: string | null;
  version: number;
  viewerSeat: string | null;
  seatUpgradeVersion: number | null;
  /** The version a "resync" frame last re-committed at (once-per-version cap). */
  resyncVersion: number | null;
  retiredBootIds: readonly string[];
};

export type SnapshotCandidate = {
  bootId?: string;
  version: number;
  viewerSeat?: string;
  source: SnapshotSource;
  seatAuthoritative?: boolean;
};

export type SnapshotDecision =
  | { accept: false; reason: "older" | "duplicate" | "wrong-seat"; state: SnapshotArbiterState }
  | {
      accept: true;
      reason: "newer" | "new-boot" | "seat-upgrade" | "recovery";
      state: SnapshotArbiterState;
    };

export function initialSnapshotArbiterState(): SnapshotArbiterState {
  return {
    bootId: null,
    version: -1,
    viewerSeat: null,
    seatUpgradeVersion: null,
    resyncVersion: null,
    retiredBootIds: []
  };
}

/** Pure ordering/seat decision. The caller commits `state` before doing presentation work. */
export function decideSnapshot(
  current: SnapshotArbiterState,
  candidate: SnapshotCandidate
): SnapshotDecision {
  const incomingBoot = candidate.bootId ?? null;
  if (incomingBoot && current.retiredBootIds.includes(incomingBoot)) {
    return { accept: false, reason: "older", state: current };
  }

  const bootChanged = Boolean(incomingBoot) && incomingBoot !== current.bootId && current.version >= 0;
  if (bootChanged) {
    return {
      accept: true,
      reason: "new-boot",
      state: {
        bootId: incomingBoot,
        version: candidate.version,
        viewerSeat: candidate.viewerSeat ?? null,
        seatUpgradeVersion: candidate.seatAuthoritative ? candidate.version : null,
        resyncVersion: null,
        retiredBootIds: current.bootId
          ? [...current.retiredBootIds, current.bootId].slice(-8)
          : current.retiredBootIds
      }
    };
  }

  if (candidate.version < current.version) {
    return { accept: false, reason: "older", state: current };
  }

  if (candidate.version === current.version) {
    const incomingSeat = candidate.viewerSeat ?? null;
    const conflictingSeat =
      incomingSeat !== null &&
      current.viewerSeat !== null &&
      incomingSeat !== current.viewerSeat &&
      incomingSeat !== "observer" &&
      current.viewerSeat !== "observer";
    if (conflictingSeat) {
      return { accept: false, reason: "wrong-seat", state: current };
    }
    const seatUpgrade =
      candidate.seatAuthoritative === true &&
      current.seatUpgradeVersion !== candidate.version &&
      (current.viewerSeat === null || current.viewerSeat === "observer" || incomingSeat !== current.viewerSeat);
    if (seatUpgrade) {
      return {
        accept: true,
        reason: "seat-upgrade",
        state: {
          ...current,
          bootId: incomingBoot ?? current.bootId,
          viewerSeat: incomingSeat ?? current.viewerSeat,
          seatUpgradeVersion: candidate.version
        }
      };
    }
    // Deliberate divergence recovery (see SnapshotSource "resync"): re-commit
    // the authoritative frame once at the held version, so a client whose
    // CONTENT drifted from the server at the same version can heal. Every
    // other source keeps the plain duplicate drop.
    if (candidate.source === "resync" && current.resyncVersion !== candidate.version) {
      return {
        accept: true,
        reason: "recovery",
        state: {
          ...current,
          bootId: incomingBoot ?? current.bootId,
          viewerSeat: incomingSeat ?? current.viewerSeat,
          resyncVersion: candidate.version
        }
      };
    }
    return { accept: false, reason: "duplicate", state: current };
  }

  return {
    accept: true,
    reason: "newer",
    state: {
      ...current,
      bootId: incomingBoot ?? current.bootId,
      version: candidate.version,
      viewerSeat: candidate.viewerSeat ?? current.viewerSeat,
      seatUpgradeVersion: candidate.seatAuthoritative ? candidate.version : null,
      resyncVersion: null
    }
  };
}
