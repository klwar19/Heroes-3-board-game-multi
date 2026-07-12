export type SnapshotSource =
  | "connect"
  | "broadcast"
  | "action-ack"
  | "sync"
  | "http-recovery"
  | "reset";

export type SnapshotArbiterState = {
  bootId: string | null;
  version: number;
  viewerSeat: string | null;
  seatUpgradeVersion: number | null;
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
      reason: "newer" | "new-boot" | "seat-upgrade";
      state: SnapshotArbiterState;
    };

export function initialSnapshotArbiterState(): SnapshotArbiterState {
  return {
    bootId: null,
    version: -1,
    viewerSeat: null,
    seatUpgradeVersion: null,
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
    if (!seatUpgrade) {
      return { accept: false, reason: "duplicate", state: current };
    }
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

  return {
    accept: true,
    reason: "newer",
    state: {
      ...current,
      bootId: incomingBoot ?? current.bootId,
      version: candidate.version,
      viewerSeat: candidate.viewerSeat ?? current.viewerSeat,
      seatUpgradeVersion: candidate.seatAuthoritative ? candidate.version : null
    }
  };
}
