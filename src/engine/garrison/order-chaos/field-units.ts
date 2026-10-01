/**
 * Order & Chaos battlefield entities (see ./field.ts for the systems): the
 * Lawful landmarks and field packets, and the Chaos structures a level can put
 * on the lawn. Pure data merged by ../content.ts into DEFENDERS / ENEMIES /
 * CARDS, so this file only imports types from it and the clock.
 *
 * Landmarks are defenders the level places (no packet): they work while they
 * stand, the horde bites them like any troop, and they are never dismissed,
 * snatched, hexed, raised again or counted as lost troops. Structures are
 * enemies like graves: they block planting on their tile and soak shots.
 */

import { sec } from "../clock";
import type { CardDef, DefDef, EnemyDef } from "../content";

export const OC_FIELD_DEFENDERS: DefDef[] = [
  // --- Field packets --------------------------------------------------------------
  { kind: "oc-boar", name: "Rooting Boar", faction: "lawful", sprite: "boar", hp: 400, card: { cost: 50, recharge: sec(12), stage: 99 },
    eatTomb: { grave: sec(4), crypt: sec(10) },
    blurb: "Plant it ON a grave or crypt: it roots the tomb up and gobbles it (a grave in 4 s, a crypt in 10 s), leaves 25 gold of grave goods and trots home (not a lost troop). Foes may bite it while it eats." },

  // --- Lawful landmarks -------------------------------------------------------------
  { kind: "oc-windmill", name: "Windmill", faction: "lawful", sprite: "", hp: 2500, landmark: "windmill", tall: true, steadfast: true,
    produce: { value: 25, every: sec(12), first: [sec(4), sec(8)] },
    blurb: "A Lawful landmark: pays 25 gold every 12 s while it stands. The horde will try to wreck it; it isn't a troop (never dismissed, snatched or counted as lost)." },
  { kind: "oc-well", name: "Magic Well", faction: "lawful", sprite: "", hp: 2000, landmark: "well", tall: true, steadfast: true,
    produce: { value: 0, every: sec(8), first: [sec(3), sec(6)], mana: 2 },
    blurb: "A Lawful landmark: gives your hero 2 mana every 8 s while it stands." },
  { kind: "oc-shrine", name: "Shrine of Magic", faction: "lawful", sprite: "", hp: 2000, landmark: "shrine", tall: true, steadfast: true,
    produce: { value: 0, every: sec(40), first: [sec(18), sec(24)], orb: true },
    blurb: "A Lawful landmark: drops a Surge orb beside it every 40 s while it stands." },
  { kind: "oc-pillar", name: "Pillar of Fire", faction: "lawful", sprite: "", hp: 2500, landmark: "pillar", tall: true, steadfast: true, light: true,
    blurb: "A Lawful landmark: lights its lane and both beside it — fog hides nothing there while it stands." }
];

/** A Chaos structure on the lawn: never marches, blocks planting on its tile, soaks shots. */
const structure = (input: Omit<EnemyDef, "faction" | "speed" | "bite" | "biteEvery" | "cost" | "might" | "recharge" | "structure">): EnemyDef => ({
  faction: "chaos", speed: 0, bite: 0, biteEvery: 10, cost: 0, might: 0, recharge: 0, structure: true, ...input
});

export const OC_FIELD_ENEMIES: EnemyDef[] = [
  structure({ kind: "oc-crypt", name: "Crypt", sprite: "", hp: 2000, radius: 0.45, crypt: { every: sec(20), maxCost: 3, flag: 2 },
    blurb: "A crypt door on the lawn: every 20 s one of the dead climbs out (two at every great assault). Blocks planting and soaks shots. A Rooting Boar eats it in 10 s." }),
  structure({ kind: "oc-chest", name: "Treasure Chest", sprite: "", hp: 400, radius: 0.4, chest: { gold: 100 },
    blurb: "Break it open for 100 gold. A thief (Kobold, Rogue) walking past pockets it instead — slay the thief to get it back." }),
  structure({ kind: "oc-bank-griffin", name: "Griffin Conservatory", sprite: "", hp: 1500, radius: 0.45, bank: { troop: "oc-griffin", gold: 50 },
    blurb: "A creature bank: Chaos keeps a Royal Griffin caged here, guarded by sleeping foes (they wake when hurt, when the bank is struck, or at the first great assault). Break it: the Griffin joins you and 50 gold spills out." }),
  structure({ kind: "oc-bank-dwarf", name: "Dwarven Treasury", sprite: "", hp: 1500, radius: 0.45, bank: { troop: "oc-dwarf", gold: 100 },
    blurb: "A creature bank: a Dwarf Shieldwall and the treasury's gold, guarded by sleeping foes. Break it: the Dwarf joins you and 100 gold spills out." }),
  structure({ kind: "oc-bank-naga", name: "Naga Bank", sprite: "", hp: 1800, radius: 0.45, bank: { troop: "oc-naga", gold: 50 },
    blurb: "A creature bank: a Naga Queen held captive, guarded by sleeping foes. Break it: she joins you and 50 gold spills out." }),
  structure({ kind: "oc-bank-cyclops", name: "Cyclops Stockpile", sprite: "", hp: 1500, radius: 0.45, bank: { troop: "oc-cyclops", gold: 50 },
    blurb: "A creature bank: a Cyclops Hurler and his boulders, guarded by sleeping foes. Break it: he joins you and 50 gold spills out." })
];

/** Field packets that place no unit (the level hands them out; see field.ts). */
export const OC_FIELD_CARDS: CardDef[] = [
  { id: "oc-raft", name: "Raft", faction: "lawful", cost: 25, recharge: sec(5), stage: 99, spell: "raft", icon: "/assets/order-chaos/field/raft.webp",
    blurb: "Lays a raft on a tile of open water: any troop can stand on it from then on." },
  { id: "oc-crate", name: "Crate", faction: "lawful", cost: 25, recharge: sec(5), stage: 99, spell: "crate", icon: "/assets/order-chaos/field/crate.webp",
    blurb: "Sets a crate of soil down on a roof tile: any troop can stand on it from then on." },
  { id: "oc-brew", name: "Wake-Up Brew", faction: "lawful", cost: 25, recharge: sec(5), stage: 99, spell: "wake", icon: "/assets/order-chaos/field/brew.webp",
    blurb: "Crag's wake-up stew: pour it on a sleeping troop (a night creature by day, or one a Nightmare lulled) and it wakes for good." }
];
