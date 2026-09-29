import type { MonsterDef, Stats } from "../engine/types";

function s(maxHp: number, maxMp: number, atk: number, def: number, mag: number, res: number, spd: number, luk: number): Stats {
  return { maxHp, maxMp, atk, def, mag, res, spd, luk };
}

type Opts = Omit<MonsterDef, "id" | "name" | "sprite" | "base" | "growth">;

function mon(id: string, name: string, sprite: string, base: Stats, growth: Stats, opts: Opts): MonsterDef {
  return { id, name, sprite, base, growth, ...opts };
}

/**
 * Monsters reuse the Hex Battlefield's animated Heroes 3 creature atlases
 * (`sprite` = atlas slug). Stats at level L = base + growth * (L - 1).
 * Every species has at least one weakness for Analyze to reveal.
 */
const LIST: MonsterDef[] = [
  // --- The Frostwood ---
  mon("frostWolf", "Frost Wolf", "restia-frost-wolf", s(26, 4, 11, 5, 2, 3, 7, 4), s(6.5, 1, 2.3, 1.1, 0.4, 0.8, 0.35, 0.3), {
    wide: true,
    // The Restia wolf sheet is drawn large: this fits its body to its two hexes.
    scale: 0.62,
    move: 5, range: 1, element: "ice", resist: { ice: 0.5, fire: 1.5 }, skills: ["bite", "howl", "frostBite", "pounceLeap"], exp: 11, gold: 8,
    drops: [{ item: "wolfFang", chance: 0.5 }, { item: "beastPelt", chance: 0.3 }], tame: 0.35, farmJob: "clear",
    desc: "Skinny, hungry and patient. It has been waiting all winter for a slow person to fall out of the sky.",
    passives: ["monPackHunter"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "firstTurn" }, { kind: "chance", value: 0.6 }], do: "howl" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "pounceLeap" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.45 }], do: "frostBite" }
      ]
    }
  }),
  mon("frostRat", "Frost Rat", "restia-frost-rat", s(16, 4, 8, 4, 2, 3, 7, 3), s(4, 1, 1.8, 1, 0.4, 0.7, 0.35, 0.3), {
    move: 4, range: 1, element: "ice", resist: { ice: 0.5, fire: 1.5 }, skills: ["bite", "scurry"], exp: 6, gold: 4,
    drops: [{ item: "beastPelt", chance: 0.2 }, { item: "oldBone", chance: 0.2 }], tame: 0.45, farmJob: "clear",
    desc: "Nests under woodsheds. Holds a very poor opinion of magical screaming.",
    passives: ["monSwarm"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "selfLacks", status: "haste" }, { kind: "chance", value: 0.4 }], do: "scurry" },
        { when: [{ kind: "hpBelow", value: 0.3 }, { kind: "alone" }], do: "retreat" }
      ]
    }
  }),
  mon("eosGoblin", "Tutorial Goblin", "goblin", s(14, 2, 6, 3, 1, 2, 4, 2), s(2, 0, 0.5, 0.5, 0, 0.5, 0, 0), {
    move: 3, range: 1, element: "phys", resist: { fire: 1.5 }, skills: ["tackle", "sandThrow"], exp: 6, gold: 0,
    drops: [], tame: 0,
    desc: "Polite, symmetrical and suspiciously well-lit. Only found in Eos, Peri's test world.",
    passives: ["monSwarm"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.3 }], do: "tackle" },
        { when: [{ kind: "round", from: 3 }, { kind: "chance", value: 0.2 }], do: "sandThrow" }
      ]
    }
  }),
  mon("buyersThug", "Buyer's Thug", "rogue", s(34, 4, 12, 7, 3, 4, 6, 5), s(7, 1, 2.3, 1.4, 0.6, 0.9, 0.3, 0.4), {
    move: 4, range: 1, element: "phys", resist: { light: 1.5 }, skills: ["cleave", "tackle", "tauntRoar"], exp: 18, gold: 30,
    drops: [{ item: "rope", chance: 0.4 }], tame: 0,
    desc: "Hired muscle for someone who only calls herself 'the buyer'. Not paid to make conversation.",
    passives: ["monFirstStrike"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "cleave" },
        { when: [{ kind: "hpAbove", value: 0.5 }, { kind: "foesInRange", range: 2, count: 2 }, { kind: "chance", value: 0.4 }], do: "tauntRoar" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.4 }], do: "tackle" }
      ]
    }
  }),
  mon("goblin", "Goblin", "goblin", s(22, 4, 9, 5, 3, 3, 5, 4), s(6, 1, 2, 1.2, 0.6, 0.8, 0.25, 0.3), {
    move: 4, range: 1, element: "phys", resist: { fire: 1.5 }, skills: ["sandThrow", "pounce"], exp: 8, gold: 10,
    drops: [{ item: "goblinCloth", chance: 0.6 }, { item: "wildHerb", chance: 0.2 }], tame: 0.35, farmJob: "clear",
    desc: "Cowardly alone, dangerous in threes. Nobody laughs at goblins twice.",
    passives: ["monSwarm"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "alone" }, { kind: "hpBelow", value: 0.5 }], do: "retreat" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.4 }], do: "pounce" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.3 }], do: "sandThrow" }
      ]
    }
  }),
  mon("hobgoblin", "Hobgoblin", "hobgoblin", s(34, 6, 12, 7, 3, 4, 5, 4), s(8, 1, 2.4, 1.5, 0.6, 0.9, 0.25, 0.3), {
    move: 4, range: 1, element: "phys", resist: { fire: 1.5 }, skills: ["howl", "tackle"], exp: 14, gold: 18,
    drops: [{ item: "goblinCloth", chance: 0.5 }, { item: "rustyBlade", chance: 0.25 }], tame: 0.25, farmJob: "clear",
    desc: "A goblin that ate its vegetables.",
    passives: ["monBerserk"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "firstTurn" }], do: "howl" },
        { when: [{ kind: "hpBelow", value: 0.4 }, { kind: "chance", value: 0.5 }], do: "howl" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.45 }], do: "tackle" }
      ]
    }
  }),
  mon("boar", "Wild Boar", "boar", s(30, 4, 11, 7, 2, 3, 5, 3), s(7, 1, 2.2, 1.5, 0.5, 0.8, 0.25, 0.3), {
    wide: true,
    move: 4, range: 1, element: "earth", resist: { ice: 1.5 }, skills: ["stomp", "goreCharge", "trample"], exp: 10, gold: 6,
    drops: [{ item: "beastPelt", chance: 0.4 }, { item: "truffle", chance: 0.04 }], tame: 0.4, farmJob: "clear",
    desc: "Roots up everything. Useful on a farm, once it likes you.",
    passives: ["monBerserk"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "foesInRange", range: 3, count: 1 }, { kind: "chance", value: 0.6 }], do: "goreCharge" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "trample" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.3 }], do: "stomp" }
      ]
    }
  }),
  mon("sprite", "Snow Pixie", "sprite", s(18, 14, 5, 4, 9, 8, 8, 8), s(4, 2, 1, 0.9, 1.8, 1.6, 0.4, 0.6), {
    move: 5, range: 3, flying: true, magic: true, element: "wind", resist: { earth: 1.5, wind: 0.5 }, skills: ["windCutter", "mend", "sleepPowder", "blink"], exp: 10, gold: 8,
    drops: [{ item: "wildBerries", chance: 0.4 }, { item: "windCrystal", chance: 0.1 }], tame: 0.45, farmJob: "water",
    desc: "A mischievous snow fairy. Befriended pixies water crops.",
    passives: ["monEvasiveFlyer"],
    ai: {
      style: "support",
      rules: [
        { when: [{ kind: "allyHurt", value: 0.5 }], do: "mend" },
        { when: [{ kind: "foesInRange", range: 4, count: 2 }, { kind: "chance", value: 0.4 }], do: "sleepPowder" },
        { when: [{ kind: "adjacentFoe" }], do: "blink" },
        { when: [{ kind: "adjacentFoe" }], do: "retreat" }
      ]
    }
  }),
  mon("wolfRider", "Wolf Rider", "wolf-rider", s(28, 4, 12, 6, 2, 3, 7, 5), s(7, 1, 2.4, 1.2, 0.5, 0.8, 0.35, 0.4), {
    wide: true,
    move: 6, range: 1, element: "phys", resist: { fire: 1.5 }, skills: ["bite", "rendingClaw", "trample"], exp: 13, gold: 12,
    drops: [{ item: "wolfFang", chance: 0.5 }, { item: "beastPelt", chance: 0.2 }], tame: 0,
    desc: "A goblin on a very bad dog.",
    passives: ["monSwift", "monAmbusher"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "trample" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.5 }], do: "rendingClaw" }
      ]
    }
  }),
  mon("harpy", "Harpy", "harpy", s(26, 8, 11, 5, 5, 6, 8, 6), s(6, 1, 2.2, 1, 1, 1.2, 0.4, 0.5), {
    move: 6, range: 1, flying: true, element: "wind", resist: { ice: 1.5, wind: 0.5 }, skills: ["rendingClaw", "shriek", "diveBomb", "swoop"], exp: 14, gold: 10,
    drops: [{ item: "feather", chance: 0.6 }], tame: 0.35, farmJob: "produce", produce: "feather",
    desc: "Shrieks, swoops, sheds feathers.",
    passives: ["monHitAndRun"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 2, count: 2 }, { kind: "chance", value: 0.35 }], do: "shriek" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "swoop" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "diveBomb" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.4 }], do: "rendingClaw" }
      ]
    }
  }),
  mon("dendroid", "Dendroid", "dendroid-guard", s(50, 6, 12, 12, 4, 6, 3, 3), s(10, 1, 2.2, 2.2, 0.8, 1.2, 0.15, 0.3), {
    move: 2, range: 1, element: "earth", resist: { fire: 1.5, earth: 0.5, wind: 0.5 }, skills: ["stomp", "harden", "regrow", "entanglingRoots", "earthenRise"], exp: 18, gold: 8,
    drops: [{ item: "wood", chance: 0.8 }, { item: "hardwood", chance: 0.3 }], tame: 0.3, farmJob: "harvest",
    desc: "A walking tree. Befriended ones harvest ripe crops gently.",
    passives: ["monRootGrip"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "hpBelow", value: 0.5 }, { kind: "selfLacks", status: "regen" }], do: "regrow" },
        { when: [{ kind: "firstTurn" }, { kind: "chance", value: 0.4 }], do: "earthenRise" },
        { when: [{ kind: "foesInRange", range: 4, count: 2 }, { kind: "chance", value: 0.4 }], do: "entanglingRoots" },
        { when: [{ kind: "foesInRange", range: 2, count: 2 }, { kind: "chance", value: 0.4 }], do: "harden" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.3 }], do: "stomp" }
      ]
    }
  }),
  mon("centaur", "Centaur", "centaur", s(32, 6, 13, 6, 4, 5, 7, 6), s(7, 1, 2.5, 1.2, 0.8, 1, 0.35, 0.4), {
    wide: true,
    move: 5, range: 4, element: "phys", resist: { dark: 1.5 }, skills: ["aimedShot", "pinningShot", "trample"], exp: 16, gold: 14,
    drops: [{ item: "beastPelt", chance: 0.3 }, { item: "windCrystal", chance: 0.1 }], tame: 0.25, farmJob: "clear",
    desc: "A proud forest archer.",
    passives: ["monSteadyAim"],
    ai: {
      style: "sniper",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "foesInRange", range: 3, count: 1 }, { kind: "chance", value: 0.5 }], do: "pinningShot" },
        { when: [{ kind: "chance", value: 0.35 }], do: "aimedShot" }
      ]
    }
  }),
  mon("ram", "Mountain Ram", "mountain-ram", s(30, 4, 10, 8, 2, 4, 5, 4), s(7, 1, 2, 1.6, 0.5, 0.9, 0.25, 0.3), {
    move: 4, range: 1, element: "earth", resist: { fire: 1.5 }, skills: ["stomp", "headbutt", "ramCharge"], exp: 10, gold: 5,
    drops: [{ item: "wool", chance: 0.3 }, { item: "beastPelt", chance: 0.3 }], tame: 0.5, farmJob: "produce", produce: "wool",
    desc: "Stubborn, woolly, and secretly affectionate.",
    passives: ["monThickHide"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.55 }], do: "ramCharge" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.55 }], do: "headbutt" }
      ]
    }
  }),
  mon("argali", "Argali", "argali", s(32, 4, 10, 8, 2, 5, 6, 5), s(7, 1, 2, 1.6, 0.5, 1, 0.3, 0.3), {
    move: 5, range: 1, element: "earth", resist: { wind: 1.5 }, skills: ["pounce", "stomp", "ramCharge", "cragLeap"], exp: 12, gold: 6,
    drops: [{ item: "beastPelt", chance: 0.3 }, { item: "milk", chance: 0.15 }], tame: 0.45, farmJob: "produce", produce: "milk",
    desc: "A wild mountain sheep. Befriended argali give milk.",
    passives: ["monSureFooted"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "foesInRange", range: 2, count: 1 }, { kind: "chance", value: 0.6 }], do: "pounce" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.4 }], do: "ramCharge" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.25 }], do: "stomp" }
      ]
    }
  }),
  mon("leprechaun", "Leprechaun", "leprechaun", s(24, 10, 8, 6, 8, 8, 9, 15), s(5, 1.5, 1.5, 1, 1.5, 1.5, 0.45, 1), {
    move: 5, range: 1, element: "phys", resist: { dark: 1.5 }, skills: ["windCutter", "coinToss"], exp: 12, gold: 60,
    drops: [{ item: "goldOre", chance: 0.3 }, { item: "luckyCharm", chance: 0.05 }], tame: 0.2, farmJob: "harvest",
    desc: "Rare and rich. Chase it.",
    passives: ["monLucky"],
    ai: {
      style: "coward",
      rules: [
        { when: [{ kind: "hpBelow", value: 0.6 }], do: "retreat" },
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "chance", value: 0.5 }], do: "coinToss" }
      ]
    }
  }),
  mon("goblinChief", "Goblin Chief", "hobgoblin", s(90, 10, 14, 8, 4, 5, 6, 5), s(10, 1, 2.5, 1.6, 0.6, 1, 0.3, 0.3), {
    move: 4, range: 1, element: "phys", resist: { fire: 1.5 }, skills: ["howl", "warcry", "tackle"], exp: 60, gold: 150,
    drops: [{ item: "goblinCloth", chance: 1 }, { item: "powerRing", chance: 0.3 }], tame: 0, boss: true, scale: 1.25,
    desc: "Tessa's F-rank field test: a Frostwood goblin with a crown made of spoons.",
    passives: ["monPackLeader"],
    ai: {
      style: "boss",
      rules: [
        { when: [{ kind: "firstTurn" }], do: "warcry" },
        { when: [{ kind: "alone" }, { kind: "chance", value: 0.5 }], do: "howl" },
        { when: [{ kind: "hpBelow", value: 0.5 }, { kind: "round", from: 3 }, { kind: "chance", value: 0.35 }], do: "warcry" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.35 }], do: "tackle" }
      ]
    }
  }),

  // --- Old Temple Ruins: the Frozen Nave (floors 1-5) ---
  mon("skeleton", "Skeleton", "skeleton", s(26, 4, 12, 7, 2, 4, 5, 3), s(6, 1, 2.3, 1.4, 0.5, 0.9, 0.25, 0.3), {
    move: 4, range: 1, element: "dark", resist: { light: 1.5, dark: 0.5, ice: 0.5 }, skills: ["boneSpear", "shieldBash"], exp: 12, gold: 8,
    drops: [{ item: "oldBone", chance: 0.6 }, { item: "rustyBlade", chance: 0.2 }], tame: 0,
    desc: "A temple guard that forgot to stop.",
    passives: ["monUndead", "monFirstStrike"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "foesInRange", range: 3, count: 2 }, { kind: "chance", value: 0.5 }], do: "boneSpear" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.3 }], do: "shieldBash" }
      ]
    }
  }),
  mon("zombie", "Zombie", "walking-dead", s(36, 4, 11, 6, 2, 3, 3, 2), s(8, 1, 2.1, 1.3, 0.4, 0.7, 0.15, 0.2), {
    move: 3, range: 1, element: "dark", resist: { fire: 1.5, light: 1.5, dark: 0.5 }, skills: ["poisonBite", "graspingHands"], exp: 12, gold: 6,
    drops: [{ item: "oldBone", chance: 0.5 }, { item: "slimeJelly", chance: 0.2 }], tame: 0,
    desc: "Slow. Patient. Unhygienic.",
    passives: ["monUndead", "monRiseAgain"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.4 }], do: "graspingHands" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.4 }], do: "poisonBite" }
      ]
    }
  }),
  mon("kobold", "Kobold", "kobold", s(20, 4, 9, 5, 3, 4, 7, 6), s(5, 1, 1.9, 1.1, 0.6, 0.9, 0.35, 0.5), {
    move: 5, range: 1, element: "earth", resist: { ice: 1.5 }, skills: ["rockThrow", "scurry", "earthenRise"], exp: 9, gold: 10,
    drops: [{ item: "ironOre", chance: 0.35 }, { item: "stone", chance: 0.4 }], tame: 0.4, farmJob: "clear",
    desc: "A tunnel-digger with a nose for ore.",
    passives: ["monSwift"],
    ai: {
      style: "sniper",
      rules: [
        { when: [{ kind: "adjacentFoe" }, { kind: "selfLacks", status: "haste" }], do: "scurry" },
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "firstTurn" }, { kind: "chance", value: 0.5 }], do: "earthenRise" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.7 }], do: "rockThrow" }
      ]
    }
  }),
  mon("troglodyte", "Troglodyte", "troglodyte", s(28, 4, 11, 8, 3, 4, 5, 4), s(6.5, 1, 2.2, 1.6, 0.6, 0.9, 0.25, 0.3), {
    move: 4, range: 1, element: "earth", resist: { light: 1.5, earth: 0.5 }, skills: ["pounce", "rendingClaw"], exp: 13, gold: 10,
    drops: [{ item: "earthCrystal", chance: 0.12 }, { item: "ironOre", chance: 0.2 }], tame: 0.3, farmJob: "clear",
    desc: "Blind, and immune to being stared at.",
    passives: ["monBlindsight", "monAmbusher"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.6 }], do: "pounce" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.5 }], do: "rendingClaw" }
      ]
    }
  }),
  mon("wight", "Wight", "wight", s(30, 16, 9, 6, 12, 10, 6, 5), s(6.5, 2.2, 1.7, 1.2, 2.2, 1.9, 0.3, 0.4), {
    move: 5, range: 2, flying: true, magic: true, element: "dark", resist: { light: 1.5, dark: 0 }, skills: ["lifeDrain", "curse", "doomMark"], exp: 16, gold: 14,
    drops: [{ item: "darkCrystal", chance: 0.12 }, { item: "oldBone", chance: 0.3 }], tame: 0,
    desc: "A hungry shade that drinks warmth.",
    passives: ["monUndead", "monEvasiveFlyer"],
    ai: {
      style: "caster",
      rules: [
        { when: [{ kind: "firstTurn" }], do: "doomMark" },
        { when: [{ kind: "hpBelow", value: 0.5 }], do: "lifeDrain" },
        { when: [{ kind: "chance", value: 0.3 }], do: "curse" }
      ]
    }
  }),
  mon("minotaurGuard", "Minotaur", "minotaur", s(44, 4, 15, 10, 3, 5, 5, 4), s(9, 1, 2.6, 1.8, 0.5, 1, 0.25, 0.3), {
    move: 4, range: 1, element: "earth", resist: { ice: 1.5 }, skills: ["cleave", "tauntRoar", "trample", "sinkhole"], exp: 22, gold: 20,
    drops: [{ item: "beastPelt", chance: 0.3 }, { item: "ironOre", chance: 0.3 }], tame: 0.15, farmJob: "clear",
    desc: "A temple guard, all horns and grudges.",
    passives: ["monThickHide", "monBerserk"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "cleave" },
        { when: [{ kind: "hpAbove", value: 0.6 }, { kind: "foesInRange", range: 2, count: 2 }, { kind: "chance", value: 0.4 }], do: "tauntRoar" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.45 }], do: "trample" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "foesInRange", range: 3, count: 1 }, { kind: "chance", value: 0.3 }], do: "sinkhole" }
      ]
    }
  }),
  mon("minotaurLord", "Temple Chimera", "manticore", s(260, 30, 18, 13, 5, 8, 6, 6), s(22, 2, 2.4, 1.6, 0.6, 1, 0.2, 0.3), {
    wide: true,
    move: 4, range: 1, element: "earth", resist: { ice: 1.5, earth: 0.5 }, skills: ["cleave", "howl", "stomp", "tailSweep", "chimeraQuake", "crushingPounce"], exp: 120, gold: 300,
    drops: [{ item: "minotaurHorn", chance: 1 }, { item: "silverOre", chance: 0.5 }], tame: 0, boss: true, scale: 1.25,
    desc: "Three heads, no manners. It guards the first seal of the Old Temple. Floor 5.",
    passives: ["monBossResolve", "monThickHide"],
    ai: {
      style: "boss",
      rules: [
        { when: [{ kind: "hpBelow", value: 0.6 }, { kind: "foesInRange", range: 2, count: 1 }], do: "chimeraQuake" },
        { when: [{ kind: "hpBelow", value: 0.6 }, { kind: "chance", value: 0.5 }], do: "charge" },
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "tailSweep" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.6 }], do: "crushingPounce" },
        { when: [{ kind: "hpBelow", value: 0.35 }, { kind: "chance", value: 0.4 }], do: "howl" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.3 }], do: "stomp" }
      ]
    }
  }),

  // --- Drowned Cloister (6-10) ---
  mon("lizardman", "Lizardman Archer", "lizardman", s(30, 6, 12, 7, 4, 6, 6, 5), s(6.5, 1, 2.3, 1.4, 0.8, 1.1, 0.3, 0.4), {
    move: 4, range: 4, element: "phys", resist: { ice: 1.5 }, skills: ["poisonArrow", "arrowRain"], exp: 16, gold: 12,
    drops: [{ item: "lizardScale", chance: 0.5 }], tame: 0.3, farmJob: "clear", desc: "Shoots first, hisses later.",
    passives: ["monSureFooted"],
    ai: {
      style: "sniper",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "foesInRange", range: 6, count: 2 }, { kind: "chance", value: 0.35 }], do: "arrowRain" },
        { when: [{ kind: "chance", value: 0.4 }], do: "poisonArrow" }
      ]
    }
  }),
  mon("lizardWarrior", "Lizard Warrior", "lizard-warrior", s(36, 4, 13, 9, 3, 5, 6, 4), s(7.5, 1, 2.5, 1.7, 0.6, 1, 0.3, 0.3), {
    move: 4, range: 1, element: "phys", resist: { ice: 1.5 }, skills: ["shieldBash", "tauntRoar", "harden"], exp: 17, gold: 12,
    drops: [{ item: "lizardScale", chance: 0.5 }], tame: 0.3, farmJob: "clear", desc: "Scales like shields.",
    passives: ["monShielded", "monFirstStrike"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "allyHurt", value: 0.5 }, { kind: "foesInRange", range: 2, count: 1 }], do: "tauntRoar" },
        { when: [{ kind: "hpBelow", value: 0.5 }, { kind: "chance", value: 0.5 }], do: "harden" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.4 }], do: "shieldBash" }
      ]
    }
  }),
  mon("serpentFly", "Serpent Fly", "serpent-fly", s(22, 6, 11, 5, 4, 5, 9, 6), s(5, 1, 2.2, 1, 0.8, 1, 0.45, 0.5), {
    move: 7, range: 1, flying: true, element: "wind", resist: { earth: 1.5, wind: 0.5 }, skills: ["poisonBite", "acidSpit", "swoop"], exp: 14, gold: 8,
    drops: [{ item: "venomSac", chance: 0.45 }], tame: 0.3, farmJob: "water", desc: "A dragonfly with opinions.",
    passives: ["monVenomous", "monEvasiveFlyer"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "acidSpit" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.4 }], do: "swoop" },
        { when: [{ kind: "hpBelow", value: 0.3 }], do: "retreat" }
      ]
    }
  }),
  mon("basilisk", "Basilisk", "basilisk", s(40, 8, 13, 11, 6, 7, 5, 4), s(8, 1.2, 2.4, 2, 1, 1.2, 0.25, 0.3), {
    wide: true,
    move: 4, range: 1, element: "earth", resist: { wind: 1.5, earth: 0.5 }, skills: ["stoneGaze", "tailSweep", "harden", "tailLash"], exp: 20, gold: 14,
    drops: [{ item: "lizardScale", chance: 0.4 }, { item: "earthCrystal", chance: 0.15 }], tame: 0.25, farmJob: "clear", desc: "Don't meet its eyes.",
    passives: ["monStoneSkin"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "tailSweep" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "foesInRange", range: 2, count: 1 }, { kind: "chance", value: 0.5 }], do: "tailLash" },
        { when: [{ kind: "foesInRange", range: 3, count: 1 }, { kind: "chance", value: 0.4 }], do: "stoneGaze" },
        { when: [{ kind: "hpBelow", value: 0.4 }, { kind: "chance", value: 0.5 }], do: "harden" }
      ]
    }
  }),
  mon("medusa", "Medusa", "medusa", s(32, 14, 10, 7, 12, 10, 6, 6), s(6.5, 2, 1.8, 1.3, 2.2, 1.8, 0.3, 0.4), {
    wide: true,
    move: 4, range: 4, magic: true, element: "earth", resist: { light: 1.5, earth: 0.5 }, skills: ["stoneGaze", "poisonArrow", "tailLash"], exp: 20, gold: 16,
    drops: [{ item: "venomSac", chance: 0.3 }, { item: "earthCrystal", chance: 0.2 }], tame: 0.2, farmJob: "harvest", desc: "Her hair hisses in harmony.",
    passives: ["monVenomous"],
    ai: {
      style: "sniper",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "stoneGaze" },
        { when: [{ kind: "chance", value: 0.4 }], do: "poisonArrow" }
      ]
    }
  }),
  mon("nix", "Nix", "nix", s(38, 8, 13, 11, 6, 9, 6, 5), s(7.5, 1.2, 2.4, 2, 1, 1.6, 0.3, 0.4), {
    move: 4, range: 1, element: "ice", resist: { ice: 0.5, wind: 1.5 }, skills: ["riptide", "tidalWave", "undertow"], exp: 19, gold: 14,
    drops: [{ item: "iceCrystal", chance: 0.2 }, { item: "silverOre", chance: 0.2 }], tame: 0.2, farmJob: "water", desc: "A tide-warrior of the drowned cloister.",
    passives: ["monSpikedHide"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 3, count: 2 }, { kind: "chance", value: 0.5 }], do: "riptide" },
        { when: [{ kind: "foesInRange", range: 4, count: 2 }, { kind: "chance", value: 0.35 }], do: "tidalWave" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "foesInRange", range: 3, count: 1 }, { kind: "chance", value: 0.45 }], do: "undertow" }
      ]
    }
  }),
  mon("waterElemental", "Water Elemental", "water-elemental", s(40, 18, 9, 9, 12, 11, 5, 4), s(8, 2.4, 1.6, 1.6, 2.2, 2, 0.25, 0.3), {
    wide: true,
    move: 4, range: 3, magic: true, element: "ice", resist: { ice: 0, fire: 0.5, earth: 1.5 }, skills: ["iceShard", "tidalWave", "flashFreeze", "mistVeil", "undertow"], exp: 22, gold: 10,
    drops: [{ item: "iceCrystal", chance: 0.35 }, { item: "slimeJelly", chance: 0.4 }], tame: 0.15, farmJob: "water", desc: "A walking wave.",
    passives: ["monFrostAura"],
    ai: {
      style: "support",
      rules: [
        { when: [{ kind: "allyHurt", value: 0.5 }, { kind: "chance", value: 0.6 }], do: "mistVeil" },
        { when: [{ kind: "firstTurn" }, { kind: "chance", value: 0.5 }], do: "flashFreeze" },
        { when: [{ kind: "foesInRange", range: 4, count: 2 }, { kind: "chance", value: 0.4 }], do: "tidalWave" },
        { when: [{ kind: "adjacentFoe" }], do: "retreat" }
      ]
    }
  }),
  mon("goblinKing", "Goblin King Grukk", "orc-chieftain", s(420, 40, 22, 15, 8, 11, 7, 8), s(26, 2, 2.6, 1.7, 0.8, 1.1, 0.25, 0.3), {
    move: 4, range: 1, element: "phys", resist: { fire: 1.5 }, skills: ["cleave", "warcry", "stomp", "kingsCharge"], exp: 300, gold: 800,
    drops: [{ item: "goldOre", chance: 1 }, { item: "silverIngot", chance: 0.5 }], tame: 0, boss: true, scale: 1.3,
    desc: "King of the Frostwood goblins, enthroned on a hundred stolen caravans. Floor 10.",
    passives: ["monBossResolve", "monPackLeader"],
    ai: {
      style: "boss",
      rules: [
        { when: [{ kind: "firstTurn" }], do: "warcry" },
        { when: [{ kind: "foesInRange", range: 4, count: 1 }], do: "kingsCharge" },
        { when: [{ kind: "round", from: 2 }, { kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "charge" },
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "cleave" },
        { when: [{ kind: "hpBelow", value: 0.4 }, { kind: "chance", value: 0.4 }], do: "warcry" }
      ]
    }
  }),

  // --- Ember Vaults (11-15) ---
  mon("imp", "Imp", "imp", s(28, 12, 10, 6, 11, 8, 8, 6), s(5.5, 1.8, 2, 1.1, 2.1, 1.5, 0.4, 0.5), {
    move: 5, range: 3, magic: true, element: "fire", resist: { fire: 0.5, ice: 1.5 }, skills: ["emberFlick", "fireball", "blink"], exp: 18, gold: 16,
    drops: [{ item: "fireCrystal", chance: 0.2 }], tame: 0.3, farmJob: "harvest", desc: "Small, loud, flammable.",
    passives: ["monSwift"],
    ai: {
      style: "caster",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "blink" },
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "chance", value: 0.5 }], do: "emberFlick" }
      ]
    }
  }),
  mon("hellHound", "Hell Hound", "hell-hound", s(44, 10, 15, 9, 8, 7, 8, 5), s(8.5, 1.5, 2.7, 1.6, 1.4, 1.2, 0.4, 0.4), {
    wide: true,
    move: 6, range: 1, element: "fire", resist: { fire: 0.5, ice: 1.5 }, skills: ["bite", "fireBreath", "pounceLeap"], exp: 24, gold: 16,
    drops: [{ item: "fireCrystal", chance: 0.2 }, { item: "beastPelt", chance: 0.3 }], tame: 0.25, farmJob: "clear", desc: "Good boy. Very hot boy.",
    passives: ["monPackHunter", "monBurningBody"],
    ai: {
      style: "swarmer",
      rules: [
        { when: [{ kind: "firstTurn" }, { kind: "foesInRange", range: 10, count: 1 }], do: "pounceLeap" },
        { when: [{ kind: "foesInRange", range: 2, count: 2 }, { kind: "chance", value: 0.5 }], do: "fireBreath" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "pounceLeap" }
      ]
    }
  }),
  mon("magog", "Magog", "magog", s(40, 14, 12, 8, 13, 9, 6, 5), s(7.5, 2, 2.2, 1.4, 2.4, 1.6, 0.3, 0.4), {
    move: 4, range: 4, magic: true, element: "fire", resist: { fire: 0.5, ice: 1.5 }, skills: ["fireBreath", "lavaLob"], exp: 24, gold: 18,
    drops: [{ item: "fireCrystal", chance: 0.3 }], tame: 0.15, farmJob: "clear", desc: "Lobs fire from a safe distance.",
    passives: ["monSteadyAim"],
    ai: {
      style: "sniper",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "foesInRange", range: 6, count: 1 }, { kind: "chance", value: 0.55 }], do: "lavaLob" }
      ]
    }
  }),
  mon("fireElemental", "Fire Elemental", "fire-elemental", s(46, 16, 14, 9, 12, 10, 6, 4), s(8.5, 2, 2.5, 1.6, 2.2, 1.8, 0.3, 0.3), {
    move: 4, range: 1, element: "fire", resist: { fire: 0, ice: 1.5, wind: 0.5 }, skills: ["fireball", "fireBreath", "flameBurst"], exp: 26, gold: 12,
    drops: [{ item: "fireCrystal", chance: 0.5 }], tame: 0.1, farmJob: "clear", desc: "A bonfire that learned to walk.",
    passives: ["monBurningBody", "monFlashpoint"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "flameBurst" },
        { when: [{ kind: "adjacentFoe" }, { kind: "chance", value: 0.35 }], do: "flameBurst" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "fireball" }
      ]
    }
  }),
  mon("efreet", "Efreet", "efreet", s(54, 16, 17, 10, 12, 10, 8, 6), s(9.5, 2, 2.9, 1.8, 2.1, 1.7, 0.4, 0.4), {
    move: 6, range: 1, flying: true, element: "fire", resist: { fire: 0, ice: 1.5 }, skills: ["fireBreath", "diveBomb", "flameStep"], exp: 32, gold: 24,
    drops: [{ item: "fireCrystal", chance: 0.4 }, { item: "goldOre", chance: 0.15 }], tame: 0.1, farmJob: "clear", desc: "A genie of flame, rarely generous.",
    passives: ["monFireShield", "monEvasiveFlyer"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 3, count: 2 }, { kind: "chance", value: 0.5 }], do: "fireBreath" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.45 }], do: "flameStep" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.6 }], do: "diveBomb" }
      ]
    }
  }),
  mon("demon", "Horned Demon", "horned-demon", s(56, 8, 18, 12, 5, 8, 6, 5), s(10, 1.2, 3, 2, 0.8, 1.4, 0.3, 0.3), {
    move: 4, range: 1, element: "dark", resist: { light: 1.5, dark: 0.5 }, skills: ["cleave", "darkPact"], exp: 30, gold: 22,
    drops: [{ item: "demonHorn", chance: 0.15 }, { item: "darkCrystal", chance: 0.15 }], tame: 0, desc: "A foot soldier of the Silent Court.",
    passives: ["monBerserk"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "cleave" },
        { when: [{ kind: "foesInRange", range: 3, count: 1 }, { kind: "hpAbove", value: 0.5 }, { kind: "chance", value: 0.35 }], do: "darkPact" }
      ]
    }
  }),
  mon("lich", "Lich", "lich", s(40, 20, 10, 8, 14, 12, 6, 5), s(7.5, 2.5, 1.8, 1.4, 2.5, 2.1, 0.3, 0.4), {
    move: 4, range: 4, magic: true, element: "dark", resist: { light: 1.5, dark: 0 }, skills: ["shadowBolt", "curse", "wordOfSilence", "blink"], exp: 28, gold: 20,
    drops: [{ item: "darkCrystal", chance: 0.25 }, { item: "manaInk", chance: 0.2 }], tame: 0, desc: "A scholar of the Silent End.",
    passives: ["monUndead", "monArcaneFlow"],
    ai: {
      style: "caster",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "blink" },
        { when: [{ kind: "adjacentFoe" }], do: "retreat" },
        { when: [{ kind: "firstTurn" }], do: "wordOfSilence" },
        { when: [{ kind: "chance", value: 0.3 }], do: "curse" }
      ]
    }
  }),
  mon("vesper", "Vesper, Voice of the Judge", "power-lich", s(600, 90, 16, 14, 22, 18, 7, 8), s(30, 4, 2.2, 1.6, 3, 2.4, 0.25, 0.3), {
    move: 4, range: 4, magic: true, element: "dark", resist: { light: 1.5, dark: 0 }, skills: ["darkNova", "shadowBolt", "curse", "lifeDrain", "silentVerdict", "blink"], exp: 600, gold: 1500,
    drops: [{ item: "darkCrystal", chance: 1 }, { item: "spellbook", chance: 0.5 }], tame: 0, boss: true, scale: 1.25,
    desc: "The Ethereal Judge's high priest, sworn to keep mortals ordinary. Floor 15.",
    passives: ["monBossResolve", "monArcaneFlow"],
    ai: {
      style: "boss",
      rules: [
        { when: [{ kind: "hpBelow", value: 0.5 }], do: "silentVerdict" },
        { when: [{ kind: "round", from: 2 }, { kind: "foesInRange", range: 6, count: 2 }], do: "darkNova" },
        { when: [{ kind: "round", from: 2 }, { kind: "noAdjacentFoe" }, { kind: "chance", value: 0.4 }], do: "charge" },
        { when: [{ kind: "adjacentFoe" }, { kind: "hpBelow", value: 0.8 }, { kind: "chance", value: 0.5 }], do: "blink" },
        { when: [{ kind: "adjacentFoe" }, { kind: "hpBelow", value: 0.7 }], do: "lifeDrain" },
        { when: [{ kind: "firstTurn" }], do: "curse" }
      ]
    }
  }),

  // --- The Rift (16-20) ---
  mon("blackKnight", "Black Knight", "black-knight", s(70, 10, 20, 15, 6, 10, 7, 5), s(11, 1.4, 3.2, 2.4, 1, 1.6, 0.35, 0.3), {
    wide: true,
    move: 5, range: 1, element: "dark", resist: { light: 1.5, dark: 0.5 }, skills: ["lifeDrain", "cleave", "tauntRoar", "trample"], exp: 40, gold: 30,
    drops: [{ item: "darkCrystal", chance: 0.3 }, { item: "silverIngot", chance: 0.1 }], tame: 0, desc: "An oath kept past death.",
    passives: ["monUndead", "monDeathBlow"],
    ai: {
      style: "tank",
      rules: [
        { when: [{ kind: "hpAbove", value: 0.5 }, { kind: "foesInRange", range: 2, count: 2 }, { kind: "chance", value: 0.4 }], do: "tauntRoar" },
        { when: [{ kind: "hpBelow", value: 0.5 }, { kind: "adjacentFoe" }], do: "lifeDrain" },
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "cleave" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "trample" }
      ]
    }
  }),
  mon("vampireLord", "Vampire Lord", "vampire-lord", s(60, 20, 18, 11, 14, 12, 9, 8), s(10, 2.2, 3, 1.8, 2.4, 2, 0.45, 0.6), {
    move: 6, range: 1, flying: true, element: "dark", resist: { light: 1.5, fire: 1.25, dark: 0 }, skills: ["lifeDrain", "curse", "mesmerize"], exp: 42, gold: 36,
    drops: [{ item: "batWing", chance: 0.5 }, { item: "darkCrystal", chance: 0.2 }], tame: 0, desc: "Elegant, ancient, thirsty.",
    passives: ["monVampiric", "monUndead"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "outnumbered" }, { kind: "chance", value: 0.4 }], do: "mesmerize" },
        { when: [{ kind: "hpBelow", value: 0.6 }], do: "lifeDrain" },
        { when: [{ kind: "firstTurn" }, { kind: "chance", value: 0.5 }], do: "curse" }
      ]
    }
  }),
  mon("beholder", "Beholder", "beholder", s(56, 24, 10, 10, 17, 14, 6, 6), s(9, 2.8, 1.8, 1.8, 2.8, 2.3, 0.3, 0.4), {
    move: 3, range: 4, magic: true, element: "dark", resist: { light: 1.5, phys: 1.25 }, skills: ["shadowBolt", "stoneGaze", "curse", "eyeRay"], exp: 44, gold: 34,
    drops: [{ item: "darkCrystal", chance: 0.3 }, { item: "manaCrystal", chance: 0.3 }], tame: 0.1, farmJob: "harvest", desc: "All eyes, no manners.",
    passives: ["monArcaneFlow", "monSteadyAim"],
    ai: {
      style: "sniper",
      rules: [
        { when: [{ kind: "adjacentFoe" }], do: "stoneGaze" },
        { when: [{ kind: "foesInRange", range: 5, count: 2 }, { kind: "chance", value: 0.5 }], do: "eyeRay" },
        { when: [{ kind: "chance", value: 0.25 }], do: "curse" }
      ]
    }
  }),
  mon("boneDragon", "Bone Dragon", "bone-dragon", s(110, 20, 22, 14, 12, 12, 7, 5), s(16, 2, 3.4, 2.2, 2, 2, 0.35, 0.3), {
    wide: true,
    move: 6, range: 1, flying: true, element: "dark", resist: { light: 1.5, dark: 0, ice: 0.5 }, skills: ["lifeDrain", "graveBreath", "tailSweep", "swoop"], exp: 60, gold: 40,
    drops: [{ item: "dragonScale", chance: 0.1 }, { item: "oldBone", chance: 0.5 }], tame: 0, desc: "A dragon that refused to stay buried.",
    passives: ["monUndead", "monGiant"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "tailSweep" },
        { when: [{ kind: "foesInRange", range: 3, count: 2 }, { kind: "chance", value: 0.6 }], do: "graveBreath" },
        { when: [{ kind: "hpBelow", value: 0.5 }], do: "lifeDrain" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.4 }], do: "swoop" }
      ]
    }
  }),
  mon("greenDragon", "Green Dragon", "green-dragon", s(140, 24, 24, 16, 16, 14, 8, 6), s(18, 2.4, 3.6, 2.4, 2.6, 2.2, 0.4, 0.4), {
    wide: true,
    move: 7, range: 1, flying: true, element: "earth", resist: { earth: 0.5, wind: 1.5 }, skills: ["fireBreath", "venomBreath", "tailSweep", "swoop"], exp: 90, gold: 80,
    drops: [{ item: "dragonScale", chance: 0.35 }], tame: 0.05, farmJob: "clear", desc: "Rare in the Rift. Rarer still as a friend.",
    passives: ["monGiant", "monRegenerate"],
    ai: {
      style: "aggressive",
      rules: [
        { when: [{ kind: "foesInRange", range: 3, count: 2 }, { kind: "chance", value: 0.6 }], do: "venomBreath" },
        { when: [{ kind: "foesInRange", range: 1, count: 2 }], do: "tailSweep" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.4 }], do: "swoop" },
        { when: [{ kind: "chance", value: 0.3 }], do: "fireBreath" }
      ]
    }
  }),
  mon("erebosAvatar", "Herald of the Judge", "arch-devil", s(1400, 200, 26, 18, 26, 20, 9, 10), s(40, 5, 2.6, 1.8, 2.6, 2, 0.3, 0.3), {
    move: 5, range: 1, element: "dark", resist: { light: 1.5, dark: 0 }, skills: ["darkNova", "shadowBolt", "cleave", "warcry", "hellfireRain", "finalSentence", "voidStep"], exp: 2000, gold: 5000,
    drops: [{ item: "demonHorn", chance: 1 }, { item: "dragonScale", chance: 0.5 }], tame: 0, boss: true, scale: 1.35,
    desc: "The Ethereal Judge's hand in Haven. It thinks you should have stayed ordinary. Floor 20.",
    passives: ["monBossResolve", "monGiant"],
    ai: {
      style: "boss",
      rules: [
        { when: [{ kind: "hpBelow", value: 0.35 }], do: "finalSentence" },
        { when: [{ kind: "hpBelow", value: 0.35 }, { kind: "chance", value: 0.7 }], do: "charge" },
        { when: [{ kind: "hpBelow", value: 0.7 }], do: "hellfireRain" },
        { when: [{ kind: "noAdjacentFoe" }, { kind: "chance", value: 0.5 }], do: "voidStep" },
        { when: [{ kind: "hpBelow", value: 0.7 }, { kind: "chance", value: 0.35 }], do: "charge" },
        { when: [{ kind: "firstTurn" }], do: "warcry" }
      ]
    }
  })
];

export const MONSTERS: Record<string, MonsterDef> = Object.fromEntries(LIST.map((def) => [def.id, def]));

export function monsterDef(id: string): MonsterDef {
  const def = MONSTERS[id];
  if (!def) throw new Error(`Unknown Restia monster ${id}`);
  return def;
}
