import {
  foldLegacyViiBonus,
  isSecretTileFeature,
  isViiFieldDesignation,
  normalizeDesignedBorders,
  normalizeDesignedBorderEdges,
  parseHexSpaceId,
  planIsUnderground,
  sanitizeCenterHexPlan,
  sanitizeCustomMapPreset,
  sanitizeFieldReward,
  sanitizeObjectPlans,
  sanitizeCoopMapSeat,
  sanitizeSinglePlayerMapStart,
  sanitizeSettlementFieldPlan,
  sanitizeObjectGuard,
  scenarioDefinitions,
  MAX_DESIGNED_GATE_LINKS,
  UNDERGROUND_LAYER_GROUPS,
  type CustomMapGateLink,
  type CustomMapPreset,
  type CustomMapTilePlan
} from "@/engine";

/**
 * Pure, isomorphic shared-map catalog logic — the single source of truth for the
 * server-side library of designed maps. It has NO node / server-only / DOM
 * imports (only the isomorphic engine), so every backend shares the exact same
 * rules, exactly like {@link LobbyRegistry} does for the room directory:
 *
 *  - the PartyKit maps Durable Object (`party/maps.ts`) holds a `MapRegistry` and
 *    answers the edge map library,
 *  - the built-in Node map store (`shared-map-store.ts`) holds one and persists it
 *    to disk so maps survive a host recycle,
 *  - the browser client (`src/lib/shared-maps.ts`) imports the shared id + type.
 *
 * Maps are FULLY SHARED: any logged-in player can open, edit (overwrite by id),
 * play, or delete any saved map. `createdByName` is attribution only — it is
 * never an edit/delete gate.
 */

/**
 * The fixed Durable Object id of the single map-catalog instance, addressed at
 * `/parties/maps/<MAPS_SINGLETON_ID>`. Mirrors {@link LOBBY_SINGLETON_ID}; it
 * never collides with a room id (rooms live in the `main` party).
 */
export const MAPS_SINGLETON_ID = "catalog";

export const MAX_MAP_NAME_LENGTH = 48;
/** Lowest / highest seat count a designed map can open. */
export const MIN_MAP_PLAYERS = 2;
export const MAX_MAP_PLAYERS = 6;
/**
 * Total maps the catalog keeps. Beyond this the oldest-touched maps are evicted
 * on upsert, so the shared library can't grow without bound.
 */
export const MAX_STORED_MAPS = 200;

/**
 * One saved map in the shared library. `players` is the number of seats the map
 * opens when picked (clamped to its scenario's range); `tiles` is the same
 * designer plan the engine already consumes (`CustomMapTilePlan[]`), so a stored
 * map round-trips straight into a game with no translation.
 */
export type SharedMapRecord = {
  id: string;
  name: string;
  scenarioId: string;
  players: number;
  tiles: CustomMapTilePlan[];
  /**
   * Optional map-only scenario conditions (resources, army, buildings, timed
   * events, victory preset, designer notes). Applied when the lobby picks this
   * map. Absent on older saves = pure tile layout.
   */
  preset?: CustomMapPreset;
  /** Stable client id of whoever last saved it (attribution only). */
  createdByClientId: string | null;
  /** Display name of whoever last saved it (attribution only). */
  createdByName: string | null;
  /**
   * Account userId of the map's OWNER — the gate for editing/deleting (see
   * {@link actorMayModifyMap}). Stamped from the authenticated actor when the map
   * is first created and preserved untouched across every later edit, so an
   * overwrite can never transfer ownership. `null` means UNOWNED: a legacy save
   * (from before ownership existed), a guest save, or any save made with accounts
   * off — such maps stay fully shared (anyone may edit/delete), exactly as before.
   */
  createdByUserId: string | null;
  createdAt: number;
  updatedAt: number;
};

/**
 * The actor attempting a map mutation: their account userId + role, or nulls
 * when signed out / a guest / accounts off. On the built-in `/api/maps` route
 * this is derived from the authenticated session COOKIE (authoritative); on the
 * cross-origin PartyKit edge it is read from the request body (a casual gate —
 * the edge has no access to the account backend, matching the app's existing
 * "Phase 2" edge-identity posture noted in src/lib/identity.ts).
 */
export type MapActor = { userId: string | null; role: "player" | "admin" | null };

/** A signed-out / guest actor — never an owner, never an admin. */
export const ANONYMOUS_MAP_ACTOR: MapActor = { userId: null, role: null };

/**
 * Whether `actor` may EDIT (overwrite) or DELETE `existing`. The ownership gate:
 *  - a brand-new id (no existing record) → always allowed (nothing to protect);
 *  - an UNOWNED map (`createdByUserId` null — legacy / guest / accounts-off save)
 *    → stays fully shared, so anyone may modify it (this is what keeps every
 *    pre-ownership map and every accountless deployment behaving exactly as
 *    before);
 *  - an OWNED map → only its owner (matching userId) or an admin.
 * Copying (save-as-new mints a fresh id) is always allowed — it never touches the
 * original record, so it is not gated here.
 */
export function actorMayModifyMap(existing: SharedMapRecord | undefined, actor: MapActor): boolean {
  if (!existing || !existing.createdByUserId) {
    return true;
  }
  if (actor.role === "admin") {
    return true;
  }
  return actor.userId !== null && actor.userId === existing.createdByUserId;
}

/**
 * Resolve the owner + creation stamp of a map being saved, mutating and
 * returning `record`. On an EDIT (an existing record with the same id) the
 * original owner AND createdAt are preserved — an overwrite never transfers
 * ownership or re-mints the creation time. On a fresh CREATE the acting user
 * becomes the owner (`null` for a guest / accounts off → an unowned, shared map).
 */
export function stampSavedMapOwnership(
  record: SharedMapRecord,
  existing: SharedMapRecord | undefined,
  actor: MapActor
): SharedMapRecord {
  if (existing) {
    record.createdAt = existing.createdAt;
    record.createdByUserId = existing.createdByUserId;
  } else {
    record.createdByUserId = actor.userId;
  }
  return record;
}

/** Every tile role the designer can place — all of these must round-trip. */
const VALID_TILE_GROUPS = new Set<CustomMapTilePlan["group"]>([
  "starting",
  "far",
  "near",
  "center",
  "sea",
  "subterranean"
]);

/** A new, collision-resistant map id (used when input carries none). */
export function newSharedMapId(): string {
  return `map_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Clamps a requested seat count into a scenario's allowed range, so a stored map
 * can never claim a player count the scenario can't seat (e.g. a 2-player-only
 * symmetric map asking for 4). Mirrors the engine's `clampSeatCount`: the ceiling
 * is the scenario's `maxPlayers` AND its number of start positions, capped at 6.
 */
export function clampMapPlayers(scenarioId: string, requested: unknown): number {
  const scenario = scenarioDefinitions[scenarioId];
  if (!scenario) {
    return MIN_MAP_PLAYERS;
  }
  const ceiling = Math.min(scenario.maxPlayers, scenario.layout.starts.length, MAX_MAP_PLAYERS);
  const floor = Math.max(MIN_MAP_PLAYERS, scenario.minPlayers);
  const wanted = typeof requested === "number" && Number.isFinite(requested) ? Math.floor(requested) : floor;
  return Math.max(floor, Math.min(ceiling, wanted));
}

/** Drops a malformed tile; keeps and normalises a well-formed one. */
function sanitizeTile(tile: unknown): CustomMapTilePlan | null {
  if (!tile || typeof tile !== "object") {
    return null;
  }
  const candidate = tile as Partial<CustomMapTilePlan>;
  if (!Number.isInteger(candidate.row) || !Number.isInteger(candidate.col)) {
    return null;
  }
  if (
    typeof candidate.group !== "string" ||
    !VALID_TILE_GROUPS.has(candidate.group as CustomMapTilePlan["group"])
  ) {
    return null;
  }
  // Tokens + Field Overrides: multiple per tile OK when slots differ. Legacy
  // singular `token` / `fieldOverride` fold into the arrays; same-slot stacks
  // drop later entries (first wins).
  const { tokens, fieldOverrides } = sanitizeTileHexPlacements(candidate);
  // Secret landmark filter (face-down only). Exact tileDefId pin still wins
  // at setup if both are present; sanitize keeps both so old maps round-trip.
  // The engine's isSecretTileFeature guard is the single feature-id allow-list.
  const secretFeature = isSecretTileFeature(candidate.secretFeature)
    ? candidate.secretFeature
    : undefined;
  // Multi-value secret-landmark restriction (valuables OR gold …): keep the
  // valid, deduped ids (face-down only).
  const secretFeatures = Array.isArray(candidate.secretFeatures)
    ? [...new Set(candidate.secretFeatures.filter(isSecretTileFeature))]
    : [];
  // Landmark bans (face-down only): "no Obelisk" / exclude certain features.
  const excludeFeatures = Array.isArray(candidate.excludeFeatures)
    ? [...new Set(candidate.excludeFeatures.filter(isSecretTileFeature))]
    : [];
  // "One of these tiles" random list (map designer): keep the unique string ids
  // (never on a starting seat), capped so untrusted input can't balloon. Tile-id
  // validity + group-pool membership is enforced by the setup validator; here we
  // only guarantee a clean string array round-trips.
  const oneOfTileDefIds =
    candidate.group !== "starting" && Array.isArray(candidate.oneOfTileDefIds)
      ? [...new Set(candidate.oneOfTileDefIds.filter((id): id is string => typeof id === "string"))].slice(0, 40)
      : [];
  // Per-tile UNDERGROUND layer override: keep it ONLY as a literal true and ONLY
  // on far/near/center/sea (kept there, stripped on `subterranean` = redundant
  // and `starting` = the v1 Surface-only seat rule). Mirrors the setup validator.
  const underground =
    candidate.underground === true &&
    typeof candidate.group === "string" &&
    UNDERGROUND_LAYER_GROUPS.has(candidate.group);
  // Designer Subterranean Gate links: kept for any UNDERGROUND-layer plan — a
  // printed cavern OR a flagged far/near/center/sea tile (the layer predicate,
  // never a bare group check) — dropping malformed ones and capping the count so
  // untrusted input can't balloon. Surface plans carry none.
  const gateLinks =
    planIsUnderground({ group: candidate.group, underground }) && Array.isArray(candidate.gateLinks)
      ? candidate.gateLinks
          .map(sanitizeGateLink)
          .filter((link): link is CustomMapGateLink => link !== null)
          .slice(0, MAX_DESIGNED_GATE_LINKS)
      : [];
  // Designer yellow borders (any group): keep unique absolute directions 0–5,
  // drop garbage, cap at 6. The engine helper is the single normalisation rule.
  const extraBorders = normalizeDesignedBorders(candidate.extraBorders);
  // Designer per-edge yellow borders (any group): canonical edge codes, garbage
  // dropped, deduped, capped at 30 — the per-edge twin of the whole-arc rule.
  const borderEdges = normalizeDesignedBorderEdges(candidate.borderEdges);
  // A center Ⅶ-field designation, plus the OPTIONAL center-hex customization
  // (guard / first-clear reward / VP). Both center-only; the customization no
  // longer requires a designation. Legacy `viiFieldReward`/`viiFieldVp` saves
  // fold into `centerHex` so the one earlier build's maps keep their bonus.
  const viiField =
    candidate.group === "center" && isViiFieldDesignation(candidate.viiField)
      ? candidate.viiField
      : undefined;
  // Multi-select Ⅶ designations (Town / Utopia / Grail) — center only.
  const viiFields =
    candidate.group === "center" && Array.isArray(candidate.viiFields)
      ? [...new Set(candidate.viiFields.filter(isViiFieldDesignation))]
      : [];
  const playerViiPick =
    candidate.group === "center" &&
    Boolean(candidate.faceDown) &&
    candidate.playerViiPick === true &&
    viiFields.length > 1;
  // Player gold/valuables pick before reveal — face-down far/near only.
  const playerResourcePick =
    Boolean(candidate.faceDown) &&
    (candidate.group === "far" || candidate.group === "near") &&
    candidate.playerResourcePick === true;
  const legacy = candidate as { viiFieldReward?: unknown; viiFieldVp?: unknown };
  const centerHex =
    candidate.group === "center"
      ? foldLegacyViiBonus(sanitizeCenterHexPlan(candidate.centerHex), legacy.viiFieldReward, legacy.viiFieldVp)
      : undefined;
  // Per-tile settlement customization (guard / VP / hold-to-win) — any group.
  const settlement = sanitizeSettlementFieldPlan(candidate.settlement);
  // SPECIFIC (per-tile) object plans (obelisk / mine) — any group that can host
  // them; a plan on a tile with no such location stays inert (settlement twin).
  const objectPlans = sanitizeObjectPlans(candidate.objectPlans);
  const singlePlayer =
    candidate.group === "starting" ? sanitizeSinglePlayerMapStart(candidate.singlePlayer) : undefined;
  // CO-OP per-position role (step 5) — start-tile-only, independent of the solo
  // block above. Absent = either side may take this starting position.
  const coopSeat =
    candidate.group === "starting" ? sanitizeCoopMapSeat(candidate.coopSeat) : undefined;

  return {
    row: candidate.row as number,
    col: candidate.col as number,
    group: candidate.group as CustomMapTilePlan["group"],
    faceDown: Boolean(candidate.faceDown),
    ...(typeof candidate.tileDefId === "string" ? { tileDefId: candidate.tileDefId } : {}),
    ...(oneOfTileDefIds.length > 0 ? { oneOfTileDefIds } : {}),
    ...(secretFeature && Boolean(candidate.faceDown) ? { secretFeature } : {}),
    ...(secretFeatures.length > 0 && Boolean(candidate.faceDown) ? { secretFeatures } : {}),
    ...(excludeFeatures.length > 0 && Boolean(candidate.faceDown) ? { excludeFeatures } : {}),
    ...(Number.isInteger(candidate.rotation) ? { rotation: (((candidate.rotation as number) % 6) + 6) % 6 } : {}),
    // `lockRotation` fixes a starting seat's home-tile orientation (no opening
    // rotation). Meaningful only on a starting plan — kept there, dropped on any
    // other group; only a literal `true` survives so garbage can't set it.
    ...(candidate.group === "starting" && candidate.lockRotation === true ? { lockRotation: true } : {}),
    // "Start revealed": the slot still DRAWS face-down-style (random / secret /
    // one-of) but is placed face-UP at setup. Meaningful only on a FACE-DOWN,
    // NON-starting plan — stripped on a starting plan (seat tiles are always
    // revealed) and on a face-up plan (already visible); only a literal `true`
    // survives so garbage cannot set it.
    ...(candidate.group !== "starting" &&
    Boolean(candidate.faceDown) &&
    candidate.revealAtSetup === true
      ? { revealAtSetup: true as const }
      : {}),
    // Solo roles/bonuses are start-tile-only and are ignored by multiplayer.
    ...(singlePlayer ? { singlePlayer } : {}),
    // Co-op per-position role — start-tile-only, ignored by a clash table.
    ...(coopSeat ? { coopSeat } : {}),
    // `viiField` forces a center slot's Ⅶ objective field (Grail / Dragon Utopia
    // / town). Meaningful only on a center plan — kept there, dropped elsewhere;
    // only a known designation survives so garbage can't set it. The center-hex
    // customization (guard / reward / VP) is independent of the designation.
    ...(viiField ? { viiField } : {}),
    ...(viiFields.length > 0 ? { viiFields } : {}),
    ...(playerViiPick ? { playerViiPick: true as const } : {}),
    ...(playerResourcePick ? { playerResourcePick: true as const } : {}),
    ...(centerHex ? { centerHex } : {}),
    ...(settlement ? { settlement } : {}),
    ...(objectPlans ? { objectPlans } : {}),
    ...(candidate.seaBand === "iv-v" || candidate.seaBand === "vi-vii" ? { seaBand: candidate.seaBand } : {}),
    ...(candidate.subBand === "iv-v" || candidate.subBand === "vi-vii" ? { subBand: candidate.subBand } : {}),
    // The UNDERGROUND layer override (far/near/center/sea only), kept as true.
    ...(underground ? { underground: true as const } : {}),
    ...(tokens && tokens.length > 0 ? { tokens } : {}),
    ...(fieldOverrides && fieldOverrides.length > 0 ? { fieldOverrides } : {}),
    ...(gateLinks.length > 0 ? { gateLinks } : {}),
    ...(extraBorders.length > 0 ? { extraBorders } : {}),
    ...(borderEdges.length > 0 ? { borderEdges } : {})
  };
}

/**
 * Anime Field Override pin on a tile plan. Kind must be a known catalog id;
 * slot 0-6 is optional (face-up exact / face-down preferred).
 */
function sanitizeTileFieldOverride(input: unknown): CustomMapTilePlan["fieldOverride"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as { kind?: unknown; slot?: unknown };
  if (typeof raw.kind !== "string" || raw.kind.length === 0 || raw.kind.length > 64) {
    return undefined;
  }
  // Allow-list is validated softly here (unknown kinds round-trip so maps with
  // future kinds don't strip; setup drops unknown kinds with a problem note).
  if (!/^[a-z0-9_]+$/i.test(raw.kind)) {
    return undefined;
  }
  const slot =
    Number.isInteger(raw.slot) && (raw.slot as number) >= 0 && (raw.slot as number) <= 6
      ? { slot: raw.slot as number }
      : {};
  return { kind: raw.kind, ...slot };
}

/**
 * Keeps a well-formed tile token (Monolith / Whirlpool / colored Gate), or
 * undefined. A Gate REQUIRES a colored pair 1-4 (dropped without one); a
 * Monolith/Whirlpool never carries one (a stray pair is stripped). A tile's
 * designed slot (0-6, including a face-down preferred hex) survives only when
 * it is a plausible slot index.
 */
function sanitizeTileToken(input: unknown): CustomMapTilePlan["token"] | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const raw = input as {
    kind?: unknown;
    pair?: unknown;
    slot?: unknown;
    guard?: unknown;
    reward?: unknown;
    vp?: unknown;
    exitMode?: unknown;
    alwaysPickable?: unknown;
  };
  if (
    raw.kind !== "monolith" &&
    raw.kind !== "whirlpool" &&
    raw.kind !== "gate" &&
    raw.kind !== "oneway_entrance" &&
    raw.kind !== "oneway_exit"
  ) {
    return undefined;
  }
  const slot =
    Number.isInteger(raw.slot) && (raw.slot as number) >= 0 && (raw.slot as number) <= 6
      ? { slot: raw.slot as number }
      : {};
  // A designer guard on the token hex (level 1-7 or exact army; clamped). A
  // one-way EXIT is never guarded.
  const guardSpec = raw.kind === "oneway_exit" ? undefined : sanitizeObjectGuard(raw.guard);
  const guard = guardSpec ? { guard: guardSpec } : {};
  // First-clear reward / VP (optional on every token kind including exits).
  const rewardSpec = sanitizeFieldReward(raw.reward);
  const reward = rewardSpec ? { reward: rewardSpec } : {};
  const vp =
    typeof raw.vp === "number" && Number.isFinite(raw.vp) && raw.vp > 0
      ? { vp: Math.min(10, Math.floor(raw.vp)) }
      : {};
  if (raw.kind === "gate" || raw.kind === "oneway_entrance" || raw.kind === "oneway_exit") {
    if (raw.pair !== 1 && raw.pair !== 2 && raw.pair !== 3 && raw.pair !== 4) {
      return undefined;
    }
    // Exit pick mode: one-way entrances AND two-way gates (same certain/random/mix).
    const exitMode =
      (raw.kind === "oneway_entrance" || raw.kind === "gate") &&
      (raw.exitMode === "random" || raw.exitMode === "certain" || raw.exitMode === "mix")
        ? { exitMode: raw.exitMode as "random" | "certain" | "mix" }
        : {};
    // Always-pickable: one-way exits AND two-way gates (mix-mode free destinations).
    const alwaysPickable =
      (raw.kind === "oneway_exit" || raw.kind === "gate") && raw.alwaysPickable === true
        ? { alwaysPickable: true }
        : {};
    return { kind: raw.kind, pair: raw.pair, ...slot, ...guard, ...reward, ...vp, ...exitMode, ...alwaysPickable };
  }
  // Monolith / Whirlpool: never carry a pair. Monoliths share the two-way exit modes.
  const monolithExit =
    raw.kind === "monolith" && (raw.exitMode === "random" || raw.exitMode === "certain" || raw.exitMode === "mix")
      ? { exitMode: raw.exitMode as "random" | "certain" | "mix" }
      : {};
  const monolithAlways =
    raw.kind === "monolith" && raw.alwaysPickable === true ? { alwaysPickable: true as const } : {};
  return { kind: raw.kind, ...slot, ...guard, ...reward, ...vp, ...monolithExit, ...monolithAlways };
}

/**
 * Multi hex placements: fold singular + array, drop same-slot stacks (first wins).
 * Cap 7 (one per flower hex).
 */
function sanitizeTileHexPlacements(candidate: Partial<CustomMapTilePlan>): {
  tokens?: NonNullable<CustomMapTilePlan["tokens"]>;
  fieldOverrides?: NonNullable<CustomMapTilePlan["fieldOverrides"]>;
} {
  const tokensRaw: NonNullable<CustomMapTilePlan["tokens"]> = [];
  if (Array.isArray(candidate.tokens)) {
    for (const entry of candidate.tokens) {
      const t = sanitizeTileToken(entry);
      if (t) {
        tokensRaw.push(t);
      }
    }
  }
  const legacyToken = sanitizeTileToken(candidate.token);
  if (legacyToken) {
    tokensRaw.unshift(legacyToken);
  }
  const overridesRaw: NonNullable<CustomMapTilePlan["fieldOverrides"]> = [];
  if (Array.isArray(candidate.fieldOverrides)) {
    for (const entry of candidate.fieldOverrides) {
      const o = sanitizeTileFieldOverride(entry);
      if (o) {
        overridesRaw.push(o);
      }
    }
  }
  const legacyOverride = sanitizeTileFieldOverride(candidate.fieldOverride);
  if (legacyOverride) {
    overridesRaw.unshift(legacyOverride);
  }

  const occupied = new Set<number>();
  const tokens: NonNullable<CustomMapTilePlan["tokens"]> = [];
  for (const t of tokensRaw) {
    if (typeof t.slot === "number") {
      if (occupied.has(t.slot)) {
        continue;
      }
      occupied.add(t.slot);
    }
    tokens.push(t);
    if (tokens.length >= 7) {
      break;
    }
  }
  const fieldOverrides: NonNullable<CustomMapTilePlan["fieldOverrides"]> = [];
  for (const o of overridesRaw) {
    if (typeof o.slot === "number") {
      if (occupied.has(o.slot)) {
        continue;
      }
      occupied.add(o.slot);
    }
    fieldOverrides.push(o);
    if (tokens.length + fieldOverrides.length >= 7) {
      break;
    }
  }
  return {
    ...(tokens.length > 0 ? { tokens } : {}),
    ...(fieldOverrides.length > 0 ? { fieldOverrides } : {})
  };
}

/** Keeps a well-formed designer gate link, or null. Pinned hexes must be valid absolute ids. */
function sanitizeGateLink(link: unknown): CustomMapGateLink | null {
  if (!link || typeof link !== "object") {
    return null;
  }
  const candidate = link as {
    surface?: { row?: unknown; col?: unknown };
    gateHex?: unknown;
    entranceHex?: unknown;
    gateGuard?: unknown;
    entranceGuard?: unknown;
  };
  const surface = candidate.surface;
  if (!surface || !Number.isInteger(surface.row) || !Number.isInteger(surface.col)) {
    return null;
  }
  const validHex = (value: unknown): value is string => typeof value === "string" && parseHexSpaceId(value) !== null;
  const gateGuard = sanitizeObjectGuard(candidate.gateGuard);
  const entranceGuard = sanitizeObjectGuard(candidate.entranceGuard);
  return {
    surface: { row: surface.row as number, col: surface.col as number },
    ...(validHex(candidate.gateHex) ? { gateHex: candidate.gateHex } : {}),
    ...(validHex(candidate.entranceHex) ? { entranceHex: candidate.entranceHex } : {}),
    ...(gateGuard ? { gateGuard } : {}),
    ...(entranceGuard ? { entranceGuard } : {})
  };
}

/**
 * Turns untrusted input (an HTTP body, a stored record) into a clean
 * `SharedMapRecord`, or `null` when it isn't a map at all (no tile array). An
 * unknown scenario falls back to the default skirmish so a typo can't orphan a
 * map; the player count is clamped to the resulting scenario, and `updatedAt` is
 * always stamped fresh so the most recently saved map sorts first.
 */
export function sanitizeSharedMap(input: unknown, now: number = Date.now()): SharedMapRecord | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const candidate = input as Partial<SharedMapRecord>;
  if (!Array.isArray(candidate.tiles)) {
    return null;
  }
  const scenarioId =
    typeof candidate.scenarioId === "string" && scenarioDefinitions[candidate.scenarioId]
      ? candidate.scenarioId
      : "skirmish";
  const tiles = candidate.tiles
    .map(sanitizeTile)
    .filter((tile): tile is CustomMapTilePlan => tile !== null);
  const name = (typeof candidate.name === "string" ? candidate.name : "").trim().slice(0, MAX_MAP_NAME_LENGTH);
  const id = typeof candidate.id === "string" && candidate.id.length > 0 ? candidate.id : newSharedMapId();
  const preset = sanitizeCustomMapPreset(candidate.preset);
  return {
    id,
    name: name.length > 0 ? name : "Unnamed map",
    scenarioId,
    players: clampMapPlayers(scenarioId, candidate.players),
    tiles,
    ...(preset ? { preset } : {}),
    createdByClientId:
      typeof candidate.createdByClientId === "string" ? candidate.createdByClientId.slice(0, 64) : null,
    createdByName: typeof candidate.createdByName === "string" ? candidate.createdByName.slice(0, 40) : null,
    createdByUserId:
      typeof candidate.createdByUserId === "string" ? candidate.createdByUserId.slice(0, 64) : null,
    createdAt:
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt) && candidate.createdAt > 0
        ? candidate.createdAt
        : now,
    updatedAt: now
  };
}

/**
 * The shared map library: an id-keyed set of records with newest-saved-first
 * ordering and a hard cap. Both backends are thin wrappers — the PartyKit maps
 * Durable Object persists `records()` to storage, the Node store to a JSON file —
 * so the catalog looks identical on either transport.
 */
export class MapRegistry {
  private readonly maps = new Map<string, SharedMapRecord>();

  constructor(records: Iterable<SharedMapRecord> = []) {
    for (const record of records) {
      if (record && typeof record.id === "string" && record.id.length > 0) {
        this.maps.set(record.id, record);
      }
    }
  }

  /**
   * Inserts or overwrites a map (keyed by id — editing reuses the same id, so it
   * never duplicates). Evicts the oldest-touched maps once the catalog exceeds
   * {@link MAX_STORED_MAPS}. Returns the stored record.
   */
  upsert(record: SharedMapRecord): SharedMapRecord {
    this.maps.set(record.id, record);
    if (this.maps.size > MAX_STORED_MAPS) {
      const oldestFirst = [...this.maps.values()].sort((left, right) => left.updatedAt - right.updatedAt);
      for (const stale of oldestFirst.slice(0, this.maps.size - MAX_STORED_MAPS)) {
        this.maps.delete(stale.id);
      }
    }
    return record;
  }

  /** Removes a map. Returns whether it was present. */
  remove(id: string): boolean {
    return this.maps.delete(id);
  }

  get(id: string): SharedMapRecord | undefined {
    return this.maps.get(id);
  }

  has(id: string): boolean {
    return this.maps.has(id);
  }

  get size(): number {
    return this.maps.size;
  }

  /** The library, newest-saved first (the order the designer / picker show). */
  list(): SharedMapRecord[] {
    return [...this.maps.values()].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  /** The raw records, for persistence to storage. */
  records(): SharedMapRecord[] {
    return [...this.maps.values()];
  }
}
