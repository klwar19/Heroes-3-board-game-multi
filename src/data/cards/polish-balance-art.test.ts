/**
 * Polish Balance Pack — the reprinted card FACES and the scope registries.
 *
 * The registry IS the contract (CLAUDE.md #1/#2): a card id in
 * `POLISH_BALANCE_CARD_IDS` promises the engine runs that card's NEW printed
 * text, so this file pins (a) the file really exists at the derived path and is
 * a real 743×1040 card scan, (b) every listed id is a real card in the library,
 * and (c) the two registries are disjoint and complete — no card is both wired
 * and declared unimplemented, and no unimplemented entry secretly ships a face
 * (which would let a face advertise a rule the engine does not run).
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { cardLibrary } from "@/data/cards/library";
import { polishBalanceSpellCards } from "./spells-balance";
import { polishBalanceArtifactCards } from "./artifacts-balance";
import { polishBalanceSpecialtyCards } from "./specialties-balance";
import {
  POLISH_BALANCE_CARD_IDS,
  POLISH_BALANCE_NOT_IMPLEMENTED,
  isPolishBalanceCard,
  polishBalanceCardImage,
  polishBalanceFaceImage
} from "./polish-balance-art";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const FACE_DIR = path.join(REPO_ROOT, "public", "assets", "polish-balance");
const toFile = (url: string) => path.join(REPO_ROOT, "public", url.replace(/^\//, ""));

describe("Polish Balance Pack art", () => {
  it("ships a real 743×1040 card face for every WIRED card, at the id-derived path", async () => {
    expect(POLISH_BALANCE_CARD_IDS.length).toBeGreaterThan(0);
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      const url = polishBalanceCardImage(cardId);
      expect(url, `no balance face resolved for ${cardId}`).toBeTruthy();
      // The path is DERIVED from the id (dots → dashes) — assert that literally,
      // so a hand-written path can never drift from the card it belongs to.
      expect(url).toBe(`/assets/polish-balance/${cardId.replaceAll(".", "-")}.webp`);
      const file = toFile(url!);
      expect(existsSync(file), `missing balance face for ${cardId}: ${file}`).toBe(true);
      const meta = await sharp(file).metadata();
      expect([cardId, meta.format, meta.width, meta.height]).toEqual([cardId, "webp", 743, 1040]);
      // A real card scan, never a placeholder stub.
      expect(statSync(file).size, `${cardId} balance face looks like a stub`).toBeGreaterThan(40 * 1024);
    }
  });

  it("ships NO face for a card whose reprint is not wired — the classic face must win", () => {
    // This is the honesty gate. A committed face for an unimplemented reprint is
    // one provider flag away from showing a player rules the engine never runs.
    const shipped = new Set(
      readdirSync(FACE_DIR)
        .filter((name) => name.endsWith(".webp"))
        .map((name) => name.replace(/\.webp$/, ""))
    );
    const wired = new Set(POLISH_BALANCE_CARD_IDS.map((id) => id.replaceAll(".", "-")));
    expect([...shipped].sort()).toEqual([...wired].sort());
  });
});

describe("Polish Balance Pack registries", () => {
  it("lists only real library cards, on both sides", () => {
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      expect(cardLibrary[cardId], `${cardId} is not a card in the library`).toBeTruthy();
    }
    for (const cardId of Object.keys(POLISH_BALANCE_NOT_IMPLEMENTED)) {
      expect(cardLibrary[cardId], `${cardId} is not a card in the library`).toBeTruthy();
    }
  });

  it("keeps the wired and not-implemented lists disjoint", () => {
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      expect(
        POLISH_BALANCE_NOT_IMPLEMENTED[cardId],
        `${cardId} is declared BOTH wired and not-implemented`
      ).toBeUndefined();
    }
  });

  it("declares every Balance-Pack Ability, Knowledge, Spell, Artifact, and Specialty as wired or not-implemented", () => {
    // The Balance Pack's Ability folder plus the supplied Knowledge card (docs/
    // polish-card-balance-spec.md §1). Every one must be accounted for, so a
    // reprint can never be silently dropped from the pack's scope.
    const PACK_ABILITIES = [
      "ability.artillery",
      "ability.ballistics",
      "ability.diplomacy",
      "ability.eagle_eye",
      "ability.first_aid",
      "ability.interference",
      "ability.intelligence",
      "ability.learning",
      "ability.mysticism",
      "ability.pathfinding",
      "ability.scouting",
      "ability.tactics",
      "ability.wisdom",
      "stat.knowledge",
      "stat.knowledge.empowered",
      // The pack's Spells folder is exactly these 21 cards (spec §2).
      "spell.anti_magic",
      "spell.bless",
      "spell.blind",
      "spell.counterstrike",
      "spell.dispel",
      "spell.disrupting_ray",
      "spell.fire_shield",
      "spell.fire_wall",
      "spell.forgetfulness",
      "spell.fortune",
      "spell.frenzy",
      "spell.haste",
      "spell.mirth",
      "spell.misfortune",
      "spell.prayer",
      "spell.remove_obstacle",
      "spell.shield",
      "spell.slayer",
      "spell.slow",
      "spell.sorrow",
      "spell.visions",
      // The pack's Artifacts folder is exactly these 27 cards (spec §3).
      "artifact.ambassadors_sash",
      "artifact.blackshard_of_the_dead_knight",
      "artifact.boots_of_speed",
      "artifact.cape_of_velocity",
      "artifact.cards_of_prophecy",
      "artifact.celestial_necklace_of_bliss",
      "artifact.centaurs_axe",
      "artifact.crown_of_dragontooth",
      "artifact.crown_of_the_five_seas",
      "artifact.diplomats_ring",
      "artifact.dragon_wing_tabard",
      "artifact.equestrians_gloves",
      "artifact.eversmoking_ring_of_sulfur",
      "artifact.golden_bow",
      "artifact.helm_of_the_alabaster_unicorn",
      "artifact.hourglass_of_the_evil_hour",
      "artifact.lions_shield_of_courage",
      "artifact.necklace_of_swiftness",
      "artifact.pendant_of_second_sight",
      "artifact.rib_cage",
      "artifact.ring_of_the_wayfarer",
      "artifact.sandals_of_the_saint",
      "artifact.shamans_puppet",
      "artifact.speculum",
      "artifact.spirit_of_oppression",
      "artifact.sword_of_judgement",
      "artifact.thunder_helmet",
      // The pack's Specialities folder is exactly these 11 cards (spec §4).
      "specialty.adelaide.4",
      "specialty.ciele.1",
      "specialty.ciele.4",
      "specialty.dracon.4",
      "specialty.gelu.4",
      "specialty.jeddite.1",
      "specialty.jeddite.6",
      "specialty.sandro.1",
      "specialty.sandro.4",
      "specialty.tarnum_conflux.1",
      "specialty.vidomina.4"
    ];
    for (const cardId of PACK_ABILITIES) {
      const accounted =
        POLISH_BALANCE_CARD_IDS.includes(cardId as (typeof POLISH_BALANCE_CARD_IDS)[number]) ||
        POLISH_BALANCE_NOT_IMPLEMENTED[cardId] !== undefined;
      expect(accounted, `${cardId} is in the Balance Pack but neither wired nor declared unimplemented`).toBe(true);
    }
    // And nothing outside the pack has crept into either list.
    for (const cardId of [...POLISH_BALANCE_CARD_IDS, ...Object.keys(POLISH_BALANCE_NOT_IMPLEMENTED)]) {
      expect(PACK_ABILITIES, `${cardId} is not one of the pack's Abilities`).toContain(cardId);
    }
  });

  it("every WIRED card's tags carry a \"Balance pack:\" note (CLAUDE.md #2)", () => {
    for (const cardId of POLISH_BALANCE_CARD_IDS) {
      // Abilities patch their printed definition in place; Spells ship a whole
      // reprinted definition that the engine swaps in under the rule — read
      // whichever one the rule actually plays.
      const tags =
        polishBalanceSpellCards[cardId]?.tags ??
        polishBalanceArtifactCards[cardId]?.tags ??
        polishBalanceSpecialtyCards[cardId]?.tags ??
        cardLibrary[cardId]?.tags ??
        [];
      expect(
        tags.some((tag) => tag.startsWith("Balance pack:")),
        `${cardId} must state its reprinted text in a "Balance pack: …" tag`
      ).toBe(true);
    }
  });
});

describe("polishBalanceCardImage / polishBalanceFaceImage", () => {
  it("CONTROL: a card outside the pack resolves no balance face and keeps its printed one", () => {
    expect(isPolishBalanceCard("ability.estates")).toBe(false);
    expect(polishBalanceCardImage("ability.estates")).toBeUndefined();
    expect(polishBalanceFaceImage("ability.estates")).toBe(cardLibrary["ability.estates"]?.assets?.cardImage);
  });

  it("CONTROL: an unimplemented reprint keeps its CLASSIC face", () => {
    for (const cardId of Object.keys(POLISH_BALANCE_NOT_IMPLEMENTED)) {
      expect(isPolishBalanceCard(cardId)).toBe(false);
      expect(polishBalanceFaceImage(cardId)).toBe(cardLibrary[cardId]?.assets?.cardImage);
    }
  });

  it("returns the balance face for a wired card, and nothing at all for no card", () => {
    expect(polishBalanceFaceImage("ability.scouting")).toBe("/assets/polish-balance/ability-scouting.webp");
    expect(polishBalanceCardImage(undefined)).toBeUndefined();
    expect(polishBalanceFaceImage(undefined)).toBeUndefined();
  });
});
