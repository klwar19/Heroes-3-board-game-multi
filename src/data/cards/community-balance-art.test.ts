/**
 * Heroes 3 Board Game Community Balance Change — the reprinted card FACES and
 * the scope registries.
 *
 * The registry IS the contract (CLAUDE.md #1/#2): a card id in
 * `COMMUNITY_BALANCE_CARD_IDS` promises the engine runs that card's NEW printed
 * text, so this file pins (a) the file really exists at the derived path and is
 * a real 743×1040 card scan, (b) every listed id is a real card in the library,
 * and (c) the two registries are disjoint — no card is both wired and declared
 * unimplemented, and no unimplemented entry secretly ships a face (which would
 * let a face advertise a rule the engine does not run).
 *
 * SCOPE TODAY: the ABILITIES family (all TWELVE sheet abilities) and the SPELLS
 * family (all TWENTY-SIX sheet spells), so `COMMUNITY_BALANCE_NOT_IMPLEMENTED`
 * is empty. The directory-listing check is the sharp one: a committed face
 * without a wired id fails, and so does a wired id with no face.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cardLibrary } from "@/data/cards/library";
import { coreUnitDefinitions } from "@/data/factions/units";
import {
  COMMUNITY_BALANCE_UNIT_FACES,
  COMMUNITY_BALANCE_UNIT_FACE_NAMES,
  communityBalanceUnitFaceImage,
  COMMUNITY_BALANCE_CARD_IDS,
  COMMUNITY_BALANCE_NOT_IMPLEMENTED,
  COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS,
  COMMUNITY_BALANCE_EMPOWERED_FACE_NAMES,
  isCommunityBalanceCard,
  communityBalanceCardImage,
  communityBalanceEmpoweredCardImage,
  communityBalanceFaceImage
} from "./community-balance-art";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FACE_DIR = path.join(REPO_ROOT, "public", "assets", "community-balance");
const toFile = (url: string) => path.join(REPO_ROOT, "public", url.replace(/^\//, ""));

describe("Community Balance Change art", () => {
  it("ships a real 743×1040 card face for every WIRED card, at the id-derived path", async () => {
    for (const cardId of COMMUNITY_BALANCE_CARD_IDS) {
      const url = communityBalanceCardImage(cardId);
      expect(url, `no community face resolved for ${cardId}`).toBeTruthy();
      // The path is DERIVED from the id (dots → dashes) — assert that literally,
      // so a hand-written path can never drift from the card it belongs to.
      expect(url).toBe(`/assets/community-balance/${cardId.replaceAll(".", "-")}.webp`);
      const file = toFile(url!);
      expect(existsSync(file), `missing community face for ${cardId}: ${file}`).toBe(true);
      const meta = await sharp(file).metadata();
      expect([cardId, meta.format, meta.width, meta.height]).toEqual([cardId, "webp", 743, 1040]);
      // A real card scan, never a placeholder stub.
      expect(statSync(file).size, `${cardId} community face looks like a stub`).toBeGreaterThan(40 * 1024);
    }
  });

  it("ships NO face for a card whose reprint is not wired — the classic face must win", () => {
    // This is the honesty gate. A committed face for an unimplemented reprint is
    // one provider flag away from showing a player rules the engine never runs.
    // (With the pack empty, the directory must be absent or empty.)
    const shipped = existsSync(FACE_DIR)
      ? new Set(
          readdirSync(FACE_DIR)
            .filter((name) => name.endsWith(".webp"))
            .map((name) => name.replace(/\.webp$/, ""))
        )
      : new Set<string>();
    const wired = new Set([
      ...COMMUNITY_BALANCE_CARD_IDS.map((id) => id.replaceAll(".", "-")),
      ...COMMUNITY_BALANCE_EMPOWERED_FACE_NAMES,
      // Unit SIDES are not cards, so they contribute their own basenames — the
      // listing must cover them or a committed unit face could sit on disk with
      // no wired reprint behind it (and vice versa).
      ...COMMUNITY_BALANCE_UNIT_FACE_NAMES
    ]);
    expect([...shipped].sort()).toEqual([...wired].sort());
  });

  it("ships a real 743×1040 face for every reprinted UNIT SIDE, at the derived path", async () => {
    // The Units tab is exactly these four sides; a face for any OTHER side would
    // be a printed-rules lie (that side is unchanged).
    expect(COMMUNITY_BALANCE_UNIT_FACES.map((entry) => `${entry.unitDefId}#${entry.side}`)).toEqual([
      "castle.halberdiers#pack",
      "castle.marksmen#pack",
      "castle.griffins#few",
      "castle.griffins#pack"
    ]);
    for (const { unitDefId, side } of COMMUNITY_BALANCE_UNIT_FACES) {
      // The side must be a real printed side of a real unit.
      const def = coreUnitDefinitions[unitDefId];
      expect(def, `${unitDefId} is not a unit definition`).toBeTruthy();
      expect(def?.[side], `${unitDefId} has no ${side} side`).toBeTruthy();
      const url = communityBalanceUnitFaceImage(unitDefId, side);
      expect(url).toBe(`/assets/community-balance/unit-${unitDefId.replaceAll(".", "-")}-${side}.webp`);
      const file = toFile(url!);
      expect(existsSync(file), `missing community unit face for ${unitDefId} ${side}: ${file}`).toBe(true);
      const meta = await sharp(file).metadata();
      expect([unitDefId, side, meta.format, meta.width, meta.height]).toEqual([unitDefId, side, "webp", 743, 1040]);
      expect(statSync(file).size, `${unitDefId} ${side} face looks like a stub`).toBeGreaterThan(40 * 1024);
    }
    // CONTROL: an UNCHANGED side of a covered unit, and an uncovered unit, resolve nothing.
    expect(communityBalanceUnitFaceImage("castle.halberdiers", "few")).toBeUndefined();
    expect(communityBalanceUnitFaceImage("castle.marksmen", "few")).toBeUndefined();
    expect(communityBalanceUnitFaceImage("castle.crusaders", "pack")).toBeUndefined();
    expect(communityBalanceUnitFaceImage(undefined, "pack")).toBeUndefined();
    expect(communityBalanceUnitFaceImage("castle.griffins", undefined)).toBeUndefined();
  });

  it("covers the sheet's three re-priced War Machines and nothing else", () => {
    const sheetMachines = ["war_machine.ammo_cart", "war_machine.ballista", "war_machine.first_aid_tent"];
    for (const cardId of sheetMachines) {
      expect(isCommunityBalanceCard(cardId), `${cardId} is not wired`).toBe(true);
      expect(cardLibrary[cardId]?.kind).toBe("war-machine");
    }
    // CONTROL: the two machines the sheet does NOT touch stay off the pack.
    expect(isCommunityBalanceCard("war_machine.catapult")).toBe(false);
    expect(isCommunityBalanceCard("war_machine.cannon")).toBe(false);
    expect(
      [...COMMUNITY_BALANCE_CARD_IDS].filter((id) => id.startsWith("war_machine.")).sort()
    ).toEqual([...sheetMachines].sort());
  });

  it("ships a real 743×1040 EMPOWERED face for every empowered ability id", async () => {
    for (const cardId of COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS) {
      // Every empowered id must also have a wired plain reprint (the empowered
      // face is the same card's empowered display state).
      expect(isCommunityBalanceCard(cardId), `${cardId} empowered face without a wired reprint`).toBe(true);
      const url = communityBalanceEmpoweredCardImage(cardId);
      expect(url).toBe(`/assets/community-balance/${cardId.replaceAll(".", "-")}-empowered.webp`);
      const file = toFile(url!);
      expect(existsSync(file), `missing empowered community face for ${cardId}: ${file}`).toBe(true);
      const meta = await sharp(file).metadata();
      expect([cardId, meta.format, meta.width, meta.height]).toEqual([cardId, "webp", 743, 1040]);
      expect(statSync(file).size, `${cardId} empowered community face looks like a stub`).toBeGreaterThan(40 * 1024);
    }
    // A card outside the empowered list resolves nothing.
    expect(communityBalanceEmpoweredCardImage("ability.logistics")).toBeUndefined();
    expect(communityBalanceEmpoweredCardImage(undefined)).toBeUndefined();
  });
});

describe("Community Balance Change registries", () => {
  it("lists only real library cards, on both sides", () => {
    for (const cardId of COMMUNITY_BALANCE_CARD_IDS) {
      expect(cardLibrary[cardId], `${cardId} is not a card in the library`).toBeTruthy();
    }
    for (const cardId of Object.keys(COMMUNITY_BALANCE_NOT_IMPLEMENTED)) {
      expect(cardLibrary[cardId], `${cardId} is not a card in the library`).toBeTruthy();
    }
  });

  it("keeps the wired and not-implemented lists disjoint", () => {
    for (const cardId of COMMUNITY_BALANCE_CARD_IDS) {
      expect(
        COMMUNITY_BALANCE_NOT_IMPLEMENTED[cardId],
        `${cardId} is declared BOTH wired and not-implemented`
      ).toBeUndefined();
    }
  });

  it("NOT_IMPLEMENTED is honest: every entry has a reason and no face", () => {
    for (const [cardId, reason] of Object.entries(COMMUNITY_BALANCE_NOT_IMPLEMENTED)) {
      expect(reason.length, `${cardId} needs a stated reason`).toBeGreaterThan(0);
      expect(isCommunityBalanceCard(cardId)).toBe(false);
      expect(communityBalanceCardImage(cardId)).toBeUndefined();
      // It keeps its CLASSIC face.
      expect(communityBalanceFaceImage(cardId)).toBe(cardLibrary[cardId]?.assets?.cardImage);
    }
  });

  it("covers the sheet's twenty-six Spells — all wired, none declared unimplemented", () => {
    // Non-vacuity marker for the SPELLS family: every id on the sheet's Spells
    // tab is accounted for on exactly one side of the contract, and each one is
    // a real Spell card (never an ability id typo'd into the list).
    const sheetSpells = [
      // AIR
      "spell.haste",
      "spell.fortune",
      "spell.precision",
      "spell.view_air",
      "spell.counterstrike",
      "spell.chain_lightning",
      // EARTH
      "spell.slow",
      "spell.shield",
      "spell.stone_skin",
      "spell.anti_magic",
      "spell.town_portal",
      // FIRE
      "spell.visions",
      "spell.fire_wall",
      "spell.misfortune",
      "spell.bloodlust",
      "spell.curse",
      "spell.inferno",
      "spell.slayer",
      "spell.frenzy",
      // WATER
      "spell.forgetfulness",
      "spell.bless",
      "spell.weakness",
      "spell.dispel",
      "spell.cure",
      "spell.mirth",
      "spell.prayer"
    ];
    expect(sheetSpells).toHaveLength(26);
    for (const cardId of sheetSpells) {
      expect(isCommunityBalanceCard(cardId), `${cardId} is not wired`).toBe(true);
      expect(cardLibrary[cardId]?.kind, `${cardId} is not a spell card`).toBe("spell");
    }
    // A spell has no distinct Empowered printing (Empowered is an ABILITY-card
    // display state), so none of them may appear in the empowered face list.
    for (const cardId of sheetSpells) {
      expect(COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS).not.toContain(cardId);
    }
  });

  it("covers the sheet's twelve Abilities — ten wired, two declared unimplemented", () => {
    // Non-vacuity marker for the loops above: the ABILITIES family is complete,
    // so every one of the sheet's 12 ability ids is accounted for on exactly one
    // side of the contract. A later family (spells / artifacts / units / war
    // machines) must extend this list consciously, not silently.
    const sheetAbilities = [
      "ability.artillery",
      "ability.ballistics",
      "ability.estates",
      "ability.first_aid",
      "ability.intelligence",
      "ability.leadership",
      "ability.luck",
      "ability.mysticism",
      "ability.necromancy",
      "ability.scouting",
      "ability.tactics",
      "ability.wisdom"
    ];
    const accounted = new Set([...COMMUNITY_BALANCE_CARD_IDS, ...Object.keys(COMMUNITY_BALANCE_NOT_IMPLEMENTED)]);
    for (const cardId of sheetAbilities) {
      expect(accounted.has(cardId), `${cardId} is on neither side of the contract`).toBe(true);
    }
    // All twelve are WIRED now (Necromancy and Intelligence landed last), so the
    // unimplemented registry is empty for this family.
    expect([...COMMUNITY_BALANCE_CARD_IDS].filter((id) => id.startsWith("ability.")).sort()).toEqual(
      [...sheetAbilities].sort()
    );
    expect(Object.keys(COMMUNITY_BALANCE_NOT_IMPLEMENTED)).toEqual([]);
    // Mysticism has no Expert side, so the sheet ships no Empowered printing for
    // it; every OTHER wired ability has one.
    expect([...COMMUNITY_BALANCE_EMPOWERED_ABILITY_IDS].sort()).toEqual(
      [...COMMUNITY_BALANCE_CARD_IDS]
        .filter((id) => id.startsWith("ability.") && id !== "ability.mysticism")
        .sort()
    );
  });
});

describe("communityBalanceCardImage / communityBalanceFaceImage", () => {
  it("CONTROL: a card outside the pack resolves no community face and keeps its printed one", () => {
    expect(isCommunityBalanceCard("ability.logistics")).toBe(false);
    expect(communityBalanceCardImage("ability.logistics")).toBeUndefined();
    expect(communityBalanceFaceImage("ability.logistics")).toBe(cardLibrary["ability.logistics"]?.assets?.cardImage);
  });

  it("resolves nothing at all for no card", () => {
    expect(isCommunityBalanceCard(undefined)).toBe(false);
    expect(communityBalanceCardImage(undefined)).toBeUndefined();
    expect(communityBalanceFaceImage(undefined)).toBeUndefined();
  });
});
