import manifest from "./fx-manifest.json";
import soundDurations from "../../public/sounds/durations.json";

/**
 * Battle-effect sprite sheets converted from the original Heroes III defs
 * (scripts/convert-h3-defs.py). The manifest carries frame geometry; this
 * module maps the game's cards and unit abilities onto those sheets plus the
 * matching sounds from /public/sounds.
 */
export type FxSheet = {
  src: string;
  label: string;
  group: string;
  role: "affect" | "hit" | "projectile";
  frames: number;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  /** "bottom": the sprite stands on the cell floor (columns of light, bolts). */
  anchor: "center" | "bottom";
  opacity?: number;
  /** Width of the effect relative to one battle cell (area spells > 1). */
  coverage?: number;
  looksLike?: string;
  sourceDef: string;
};

const sheets = manifest as Record<string, FxSheet>;

export function getFxSheet(key: string): FxSheet | undefined {
  return sheets[key];
}

export function listFxSheets(): Record<string, FxSheet> {
  return sheets;
}

/**
 * How a spell looks and sounds on the table. `affect` sprites play over the
 * target unit (in order, each entry delayed by `delayMs`); `projectile`
 * travels from the caster's seat to the target before `hit` explodes there.
 * `tint` washes the target's card (bloodlust has no sprite in the original
 * game either - the engine tinted the creature red).
 */
export type SpellFxPlan = {
  projectile?: string;
  hit?: string;
  affect?: { key: string; delayMs?: number }[];
  tint?: "bloodlust";
  /** /public/sounds manifest key, e.g. "spells/fireball". */
  sound?: string;
  hitSound?: string;
};

export const spellFxPlans: Record<string, SpellFxPlan> = {
  "spell.magic_arrow": {
    // projectile-0 is the horizontal arrow; the stage rotates it in flight.
    projectile: "magic-arrow-projectile-0",
    hit: "magic-arrow-hit",
    sound: "spells/magic-arrow"
  },
  "spell.lightning_bolt": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/lightning-bolt"
  },
  "spell.fireball": {
    hit: "fireball",
    sound: "spells/fireball",
    hitSound: "spells/fireball-hit"
  },
  "spell.stone_skin": {
    affect: [{ key: "stone-skin" }],
    sound: "spells/stone-skin"
  },
  "spell.bloodlust": {
    tint: "bloodlust",
    sound: "spells/bloodlust"
  },
  "spell.cure": {
    affect: [{ key: "cure" }],
    sound: "spells/cure"
  },
  "spell.fortune": {
    affect: [{ key: "fortune" }],
    sound: "spells/fortune"
  },
  "spell.bless": { affect: [{ key: "bless" }], sound: "spells/bless" },
  "spell.prayer": { affect: [{ key: "prayer" }], sound: "spells/prayer" },
  "spell.haste": { affect: [{ key: "haste" }], sound: "spells/haste" },
  "spell.slow": { affect: [{ key: "slow" }], sound: "spells/slow" },
  "spell.precision": { affect: [{ key: "precision" }], sound: "spells/precision" },
  "spell.curse": { affect: [{ key: "curse" }], sound: "spells/curse" },
  "spell.dispel": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  // Chain Lightning forks lightning from the first struck unit (reuses the
  // bolt + crackle pair, like Lightning Bolt). Inferno's plan is defined below.
  "spell.chain_lightning": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/chain-lightning"
  },
  // Blind drops the paralyze sprite on the target with the Blind cast cue — both
  // the paralyze sheet and blind.mp3 were converted but had never been wired.
  "spell.blind": { affect: [{ key: "paralyze" }], sound: "spells/blind" },
  // Berserk: the H3 berserk glyph flares over the unit it seizes, with the cast
  // roar — both the converted sheet and berserk.mp3 had never been wired.
  "spell.berserk": { affect: [{ key: "berserk" }], sound: "spells/berserk" },
  // Teleport has no converted sprite sheet — the unit blinking to its new space
  // (its card-glide) is the visual. The cast carries the H3 teleport sound on the
  // chosen unit; queueBoardFx plays a sound-only plan over the target.
  "spell.teleport": { sound: "spells/teleport" },
  // Clone has no converted sprite sheet — the new Clone Token appearing on the
  // board (its entrance pop) is the visual. The H3 clone cast cue plays on the
  // cloned unit at SPELL_CAST_RESOLVED (a unit target); the follow-up choice then
  // drops the token. queueBoardFx plays this sound-only plan over the target.
  "spell.clone": { sound: "spells/clone" },
  // Combat buffs / debuffs / reactions: each has its converted sheet and sound.
  // The ones cast on a chosen unit (Weakness, Anti-Magic, Fire Shield,
  // Counterstrike, Forgetfulness) shimmer over that unit; the player-scoped or
  // reaction ones (Mirth, Sorrow, Slayer, Magic Mirror) resolve with no single
  // unit to anchor on, so their cast sound carries the cue (see page.tsx).
  "spell.weakness": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  "spell.anti_magic": { affect: [{ key: "anti-magic" }], sound: "spells/anti-magic" },
  "spell.fire_shield": { affect: [{ key: "fire-shield" }], sound: "spells/fire-shield" },
  "spell.counterstrike": { affect: [{ key: "counterstrike" }], sound: "spells/counterstrike" },
  "spell.forgetfulness": { affect: [{ key: "forgetfulness" }], sound: "spells/forgetfulness" },
  "spell.mirth": { affect: [{ key: "mirth" }], sound: "spells/mirth" },
  "spell.sorrow": { affect: [{ key: "sorrow" }], sound: "spells/sorrow" },
  "spell.slayer": { affect: [{ key: "slayer" }], sound: "spells/slayer" },
  "spell.magic_mirror": { affect: [{ key: "magic-mirror" }], sound: "spells/magic-mirror" },
  // Misfortune: a hex shimmers over the attacker whose Attack die it negates,
  // with the H3 misfortune cast cue (its converted sheet + sound were already on
  // disk). Played as an instant on the declared attack, like Weakness.
  "spell.misfortune": { affect: [{ key: "misfortune" }], sound: "spells/misfortune" },
  // Shield / Air Shield: a warding shimmer over the buffed unit with the H3 cast
  // cue (their sprite sheets + sounds were converted but never wired).
  "spell.shield": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "spell.air_shield": { affect: [{ key: "air-shield" }], sound: "spells/air-shield" },
  // Protection from Air/Earth/Fire/Water: these resolve by cancelling the enemy
  // Spell, so their sprite + sound play off the SPELL_CAST_CANCELLED cue (keyed
  // by the cancelling card in page.tsx) rather than a SPELL_CAST_RESOLVED.
  "spell.protection_from_air": { affect: [{ key: "protect-air" }], sound: "spells/protect-air" },
  "spell.protection_from_earth": { affect: [{ key: "protect-earth" }], sound: "spells/protect-earth" },
  "spell.protection_from_fire": { affect: [{ key: "protect-fire" }], sound: "spells/protect-fire" },
  "spell.protection_from_water": { affect: [{ key: "protect-water" }], sound: "spells/protect-water" },
  // Map spells resolve on the adventure map (no battle board to anchor sprites
  // on), so only a cast sound is wired; page.tsx plays it off the CARD_PLAYED
  // cue for map-timed cards. Town Portal and Dimension Door share the H3
  // teleport cue; Fly / Water Walk / Visions have their own clips.
  "spell.town_portal": { sound: "spells/teleport" },
  "spell.dimension_door": { sound: "spells/teleport" },
  "spell.fly": { sound: "spells/fly" },
  "spell.water_walk": { sound: "spells/water-walk" },
  "spell.visions": { sound: "spells/visions" },
  // Summon Elemental: resolves on an empty space (no unit to anchor a sprite
  // on), so only a cast sound is wired — the new unit appearing is the visual.
  // Air has its own H3 summon clip; the others use the element's own voice.
  "spell.summon_air_elemental": { sound: "spells/air-elemental" },
  "spell.summon_earth_elemental": { sound: "units/earth-elemental-attack" },
  "spell.summon_fire_elemental": { sound: "units/fire-elemental-attack" },
  "spell.summon_water_elemental": { sound: "units/water-elemental-attack" },
  // Inferno: the dice (rolled out first under the cast roar, see SPELL_DICE_ROLLED)
  // settle, then this fire sheet erupts over the chosen space with the fire-storm
  // impact before the per-unit damage floats. `sound` rides under the dice; the
  // `hit` burst + `hitSound` land on the space once the roll has read out.
  "spell.inferno": { hit: "inferno", sound: "spells/inferno", hitSound: "effects/fire-storm" },
  // Frost Ring: select a space — the ring of frost bursts over that cell (the
  // space-target path in page.tsx anchors it to the cell, like Inferno) and the
  // adjacent units' damage floats after. No dice, so the impact sound rides on
  // the burst itself.
  "spell.frost_ring": { hit: "frost-ring", sound: "spells/frost-ring", hitSound: "spells/frost-ring" },
  // Implosion: the converted implosion sheet caves in over the struck enemy with
  // the H3 cast roar; the damage number is held behind it (it had been resolving
  // silently). Anchored on the target unit by the SPELL_CAST_RESOLVED path.
  "spell.implosion": { affect: [{ key: "implosion" }], sound: "spells/implosion" },
  // Disrupting Ray: the H3 projectile flies caster→target, then the ray sheet
  // shimmers over the unit whose Defense it strips (same two-def pair as PC).
  "spell.disrupting_ray": {
    projectile: "disrupting-ray-projectile",
    affect: [{ key: "disrupting-ray" }],
    sound: "spells/disrupting-ray"
  },
  // Frenzy: an Instant on your own attack (no board target of its own), so its
  // glyph flares at centre stage over the played card with the cast cue — the
  // same CARD_PLAYED path as Weakness / Slayer.
  "spell.frenzy": { affect: [{ key: "frenzy" }], sound: "spells/frenzy" },
  // Sacrifice shares the H3 Resurrection/Animate Dead sheet (C01SPE0 — same
  // def as Resurrection in the converted library) over the healed unit, with
  // its own sacrifice cast cue.
  "spell.sacrifice": { affect: [{ key: "resurrection" }], sound: "spells/sacrifice" },
  // Resurrection spell cast (lethal-save reaction): the real Resurrection
  // sheet + cast cue. The killing-blow cancel also fires the ability-id
  // "resurrection" plan below (same sheet) when the blow is actually stopped.
  "spell.resurrection": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Animate Dead: same H3 resurrection/reanimation sheet (C01SPE0), with the
  // Animate Dead cast sound. Also what the Soul Eater commander cast reuses.
  "spell.animate_dead": { affect: [{ key: "resurrection" }], sound: "spells/animate-dead" },
  // Earthquake: a siege-only blast with no single unit to anchor on, so it
  // carries just the H3 earthquake rumble (Walls coming down animate off
  // FORTIFICATION_DESTROYED). Plays at centre stage off SPELL_CAST_RESOLVED.
  "spell.earthquake": { sound: "spells/earthquake" },
  // Remove Obstacle: an Instant cast that opens the obstacle-removal choice; the
  // H3 remove-obstacle cue plays as it is cast, and each cleared marker chimes
  // again off COMBAT_OBSTACLE_REMOVED (Walls/Gate off FORTIFICATION_DESTROYED).
  "spell.remove_obstacle": { sound: "spells/remove-obstacle" },
  // View Air / View Earth: map-board economy spells (gain resources / capture a
  // Mine) with no battle board, so they carry only the H3 view cast cue, played
  // off the CARD_PLAYED cue like the other map spells.
  "spell.view_air": { sound: "spells/view" },
  "spell.view_earth": { sound: "spells/view" },
  // Hero-specialty area blasts resolve through a card PLAY (CARD_PLAYED), which
  // anchors their `affect` sprite at centre stage with the cast sound. Xyron's
  // Inferno roars with the fire sheet; Deemer's Meteor Shower I/VI rain rock.
  "specialty.xyron.1": { affect: [{ key: "inferno" }], sound: "spells/inferno" },
  "specialty.xyron.4": { affect: [{ key: "inferno" }], sound: "spells/inferno" },
  "specialty.xyron.6": { affect: [{ key: "inferno" }], sound: "spells/inferno" },
  "specialty.deemer.1": { affect: [{ key: "meteor-shower" }], sound: "spells/meteor-shower" },
  "specialty.deemer.6": { affect: [{ key: "meteor-shower" }], sound: "spells/meteor-shower" },
  // Septienna's Death Ripple sweep (every level's damage side), Melodia's Fortune
  // luck wash and Glacius's Frost Ring (I/VI area damage) all resolve through a
  // card PLAY with no single board target, so their sprite bursts at centre stage
  // with the cast sound — exactly like Xyron/Deemer. Glacius IV is a card-economy
  // instant that casts no ring, so it gets no FX. The "+N Power" side of these
  // CHOOSE_ONE cards plays no board effect, so the CARD_PLAYED handler skips its
  // sprite (it guards every "+N Power" optionLabel).
  "specialty.septienna.1": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "specialty.septienna.4": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "specialty.septienna.6": { affect: [{ key: "death-ripple" }], sound: "spells/death-ripple" },
  "specialty.melodia.1": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "specialty.melodia.4": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "specialty.melodia.6": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "specialty.glacius.1": { affect: [{ key: "frost-ring" }], sound: "spells/frost-ring" },
  "specialty.glacius.6": { affect: [{ key: "frost-ring" }], sound: "spells/frost-ring" },
  // Ash's Bloodlust has no sprite in the original game (the engine tinted the unit
  // red). On a card play there is no board unit to tint, so the CARD_PLAYED handler
  // flashes the red battle-rage wash at centre stage with the bloodlust cast roar.
  "specialty.ash.1": { tint: "bloodlust", sound: "spells/bloodlust" },
  "specialty.ash.4": { tint: "bloodlust", sound: "spells/bloodlust" },
  "specialty.ash.6": { tint: "bloodlust", sound: "spells/bloodlust" }
};

/** Played at center stage when a spell is countered. */
export const cancelFx = { key: "dispel", sound: "spells/dispel" };

/** Unit abilities that have a matching original effect. */
export const abilityFxPlans: Record<string, SpellFxPlan> = {
  // Fire Shield's burn: when an adjacent attacker strikes a shielded unit, the
  // engine fires a "fire-shield" ability event on the attacker (the unit that
  // takes the burn). The fire sheet flares over it with the dedicated
  // fire-shield-hit impact — distinct from the cast shimmer (spells/fire-shield)
  // that plays when the shield is first placed. Shared by the Fire Shield spell
  // and Rashka's Demoniac specialty (both raise the same FIRE_SHIELD effect).
  "fire-shield": { affect: [{ key: "fire-shield" }], sound: "effects/fire-shield-hit" },
  // WOG War Zealot's innate Magic Mirror: applyUnitMagicMirror fires a
  // UNIT_ABILITY_TRIGGERED("wog-war-zealot-mirror") the instant it reflects, so
  // the mirror glass flares over the Zealot with the same sprite + cue the Magic
  // Mirror spell plays — the free innate reflect is now seen AND heard, exactly
  // like the card. (The card-based Magic Mirror fires its own CARD_PLAYED cue, so
  // this never double-plays with it.)
  "wog-war-zealot-mirror": { affect: [{ key: "magic-mirror" }], sound: "spells/magic-mirror" },
  // WOG Dracolich's Necrotic Armor: when its "-1" armor die soaks an incoming
  // blow, the engine fires UNIT_ABILITY_TRIGGERED("wog-dracolich-armor"). The
  // spell-resistance (anti-magic) shimmer wards over the Dracolich; page.tsx pins
  // it to the blow it blocked and layers the unit's own DEFEND cry under it (its
  // per-unit voice, which a fixed library `sound` here could not express).
  "wog-dracolich-armor": { affect: [{ key: "anti-magic" }] },
  "magog-fireball-splash": { hit: "fireball", hitSound: "spells/fireball-hit" },
  "lich-death-cloud": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  // WOG Dracolich's spread attack (Necrotic Death Cloud) is the Lich's Death
  // Cloud by another name — a full second attack on a unit adjacent to the
  // target. It emits UNIT_ABILITY_TRIGGERED("wog-dracolich-death-cloud") just
  // like the Lich fires "lich-death-cloud", so it gets the SAME death-cloud burst
  // + sound (parity with the Lich; without this its spread landed silently).
  "wog-dracolich-death-cloud": { hit: "death-cloud", hitSound: "spells/death-cloud" },
  // Faerie Dragons' activation damage-spell flies as an Ice Bolt from the
  // dragon to the chosen unit, then explodes on the hit.
  "faerie-dragon-spell": {
    projectile: "ice-bolt-projectile-0",
    hit: "ice-bolt-hit",
    sound: "spells/ice-bolt",
    hitSound: "spells/ice-bolt-hit"
  },
  // Lethal-save sources (Alamar's specialty, the Resurrection spell and the
  // Archangels' once-per-combat cancel) all emit the "resurrection" ability
  // event when the killing blow is cancelled, so one plan covers all three.
  // MUST use the dedicated Resurrection sheet (C01SPE0) — never the Prayer
  // column (C10SPW), which is a different spell.
  resurrection: { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Phoenixes' Rebirth reuses the same Resurrection sheet when the killing blow
  // is shrugged off and the bird clings to life at 1 Health.
  "phoenix-rebirth": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Jotunn Warlord's start-of-activation Teleport: a sound-only plan, exactly
  // like the Teleport Spell (spell.teleport) — the relocated unit's card-glide
  // (UNIT_MOVED) is the visual, and this carries the same H3 teleport sound,
  // emitted on the UNIT_ABILITY_TRIGGERED event in resolveTeleportChoice.
  "bulwark-jotunn-teleport": { sound: "spells/teleport" },
  // Printed unit abilities wired with their original H3 effect + sound.
  "wyvern-sting": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "rust-dragon-acid": { hit: "acid-breath", hitSound: "effects/acid-breath" },
  "gorgon-death-stare": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  // Fortress Gorgons (Pack) carry the SAME Death Stare under their own ability id
  // (the engine emits `followUp.abilityId`), so the faction Pack needs its own
  // plan or its stare lands silently while the neutral guard's animates. Parity
  // with the neutral `gorgon-death-stare` above.
  "fortress-gorgon-death-stare": { affect: [{ key: "death-stare" }], sound: "spells/death-stare" },
  // Paralysis / Stone Gaze / Paralyzing Gaze: the H3 "paralyze" freeze glyph +
  // paralyze sound flash over the unit that gains the Paralysis token (the same
  // sheet the Blind spell uses). Every id below is emitted ONLY when the token
  // actually lands — own-die variants (Azure Dragon, Fortress Basilisk, the
  // commander's Fearsome) fire once on a matching attack face; automatic
  // retaliation gazes (Medusa Pack/Neutral, Unicorn) fire on the land event;
  // extra-die variants (neutral Basilisk Stone Gaze, Medusa Few die gaze, the
  // commander's Paralyzing Touch) use the Death-Stare id split in reducer.ts
  // (bare id on land, `${id}-roll` on a miss — left unmapped below). The
  // Stacked Medusa Stores bank guard fires on its melee attack.
  "azure-dragon-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "fortress-basilisk-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "basilisk-paralysis": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "medusa-paralyze-retaliation": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "medusa-paralyze-retaliation-die": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "unicorn-paralyze-retaliation": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "bank-medusa-paralyze-stacked": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "commander-fearsome": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  "commander-paralyze": { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  // A unit that shrugs off Paralysis (ignore-paralysis / Soul Eater undead…)
  // wards with the same anti-magic shimmer the resistance roll uses.
  "ignore-paralysis": { affect: [{ key: "anti-magic" }], sound: "effects/magic-resist" },
  "dread-knight-death-blow": { affect: [{ key: "death-ripple" }], sound: "effects/death-blow" },
  // Fortress Wyverns' poison cubes: the poison cloud both when the cubes are
  // planted (on the attack) and when one bleeds the unit at its activation.
  "wyvern-poison-cube-few": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "wyvern-poison-cube-pack": { affect: [{ key: "poison" }], sound: "spells/poison" },
  "wyvern-poison-cube": { affect: [{ key: "poison" }], sound: "spells/poison" },
  // Rampart Dendroids' Bind: roots lash out as the Dendroid attacks.
  "dendroid-bind": { affect: [{ key: "bind" }], sound: "effects/bind" },
  // Rampart Dwarves' Magic Resistance: a warding shimmer when a Spell/Specialty
  // is rolled against (the "magic resist" cue from the original game).
  "dwarf-magic-resistance": { affect: [{ key: "anti-magic" }], sound: "effects/magic-resist" },
  // Tower Genies' Wish: a sparkle of fortune as a Spell is conjured to hand.
  "genie-spell-draw-few": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  "genie-spell-draw-pack": { affect: [{ key: "fortune" }], sound: "spells/fortune" },
  // Slayer Spell: after its dice read out (they ride the attack-die overlay), the
  // slayer glyph flares over the gold target as the empowered blow lands.
  slayer: { affect: [{ key: "slayer" }], sound: "spells/slayer" },
  // --- Stronghold expansion creature abilities -----------------------------
  // Thunderbirds' Lightning Strike: the engine rolls one extra Attack die after
  // the bird's blow (reducer.ts applyAttackDieDamageFollowUps) and emits a
  // UNIT_ABILITY_TRIGGERED on the target. It crackles with the SAME lightning
  // bolt + thunder-crack the Lightning Bolt spell uses, so the strike both LOOKS
  // and SOUNDS like a thunderclap (its sibling Wyvern sting already animates this
  // way). The 1-damage hit, when the die lands on "0"/"+1", floats after the bolt.
  "thunderbirds-lightning": {
    affect: [{ key: "lightning-bolt" }, { key: "lightning-crackle", delayMs: 220 }],
    sound: "spells/lightning-bolt"
  },
  // Ogres' "Bloodlust Token" (few +1 / pack +2 Attack): a chosen friendly unit is
  // whipped into a battle frenzy. It reuses the Bloodlust spell's presentation —
  // the red battle-rage wash over the buffed unit + the H3 bloodlust cry — since
  // the token IS a Bloodlust buff by another name.
  "ogres-attack-token-few": { tint: "bloodlust", sound: "spells/bloodlust" },
  "ogres-attack-token-pack": { tint: "bloodlust", sound: "spells/bloodlust" },
  // Behemoths' Corrosion (pack): after the crushing blow, an acid token eats the
  // target's armour. It splashes with the same acid burst the Rust Dragon's Acid
  // Breath uses (the two share the Corrosion-token mechanic).
  "behemoth-corrosion": { hit: "acid-breath", hitSound: "effects/acid-breath" },
  // Vampires' Life Drain: after the bite, the unit heals (vampire-heal-on-attack
  // few/pack, and the Crypt-bank "remove all damage" bank-vampire-life-drain).
  // Both fire a UNIT_ABILITY_TRIGGERED under their own id (heal.abilityId) — they
  // This is NOT Cure: it is the exact user-supplied Vampire heal .def, converted
  // losslessly into the same sprite-sheet pipeline as the original H3 effects.
  "vampire-heal-on-attack": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  "bank-vampire-life-drain": { affect: [{ key: "vampire-life-drain" }], sound: "effects/drain-life" },
  // Dragon Flies' Dispel: stripping the enemy's own buffs off the target fires a
  // UNIT_ABILITY_TRIGGERED("dragon-fly-dispel"); reuse the same dispel shimmer +
  // sound the spell-counter cue uses (cancelFx) so the cleanse is seen and heard.
  "dragon-fly-dispel": { affect: [{ key: "dispel" }], sound: "spells/dispel" },
  // Wraiths' / Trolls' activation Regeneration: the unit mends itself at the start
  // of its turn. The engine now emits a UNIT_ABILITY_TRIGGERED under the ability id
  // (alongside the "+N" heal floater), so the green Cure shimmer + heal chime play
  // — they previously regenerated in silence.
  "wraith-heal-1": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "wraith-heal-2": { affect: [{ key: "cure" }], sound: "spells/cure" },
  "troll-heal-3": { affect: [{ key: "cure" }], sound: "spells/cure" },
  // --- Factory (expansion) gold / cube abilities -----------------------------
  // Couatls' activated invulnerability ("Ethereal Coil"): a protective barrier
  // shimmers over the unit — when it goes up (on the couatl, endsActivation), when
  // it shrugs off an attack (the ward.abilityId event in applyAttackDamageFrom-
  // Candidate) and as it fades. The Shield spell's barrier + chime read as
  // "ignore all damage & spell effects".
  "couatl-invulnerability-few": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "couatl-invulnerability-pack": { affect: [{ key: "shield" }], sound: "spells/shield" },
  "couatl-invulnerability": { affect: [{ key: "shield" }], sound: "spells/shield" },
  // Dreadnoughts' (Juggernaut) splash allocation ("Concussive Slam"): a shockwave
  // ripples over each struck adjacent unit as the Juggernaut's cannon reports. The
  // event fires per target (targetUnitId), so each pick gets its own burst — the
  // same per-target pattern as the Magog fireball splash.
  "dreadnought-splash-1": { affect: [{ key: "death-ripple" }], sound: "units/dreadnought-shoot" },
  "dreadnought-splash-2": { affect: [{ key: "death-ripple" }], sound: "units/dreadnought-shoot" },
  // Automaton (Few) faction cube: a mechanical whir as a cube is armed onto the
  // unit ("Overcharge"), then the DETONATE explosion — a fireball burst + the
  // Automaton's signature blast. The fixed-amount Detonates (the boxed
  // automaton-detonate and the neutral automaton-detonate-1) share the same blast.
  "automaton-place-cube": { sound: "units/automaton-move" },
  "automaton-detonate-cubes": { affect: [{ key: "fireball" }], sound: "units/automaton-special" },
  "automaton-detonate": { affect: [{ key: "fireball" }], sound: "units/automaton-special" },
  "automaton-detonate-1": { affect: [{ key: "fireball" }], sound: "units/automaton-special" },
  // Sandworm (Pack) faction cube: it "Devours" the unit it removed (a life-drain
  // over the corpse, banking a cube on the kill) and, when it spends a cube to
  // strike again, a "Feeding Frenzy" washes over it.
  "sandworm-cube-gain": { affect: [{ key: "vampire-life-drain" }], sound: "units/sandworm-special" },
  "sandworm-cube-attack": { affect: [{ key: "frenzy" }], sound: "spells/frenzy" },
  // Bounty Hunters (Neutral) "Preemptive Shot": a Counterstrike-style readiness
  // shimmer over the guard as it fires back FIRST (the retaliation attack itself
  // is the shot animation/sound; this cues the special pre-emptive timing).
  "bounty-hunter-preemptive": { affect: [{ key: "counterstrike" }], sound: "units/gunslinger-special" },
  // --- Additional monster ability cues (only ids that fire on the real effect) -
  // Cove Sorceresses' Weakness token (activation place OR on-attack): the same
  // Weakness glyph + cry the Weakness spell uses.
  "sorceress-weakness-few": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  "sorceress-weakness-on-attack": { affect: [{ key: "weakness" }], sound: "spells/weakness" },
  // Bulwark Freezing Shot: Initiative debuff after the attack — the Slow wash
  // is the closest H3 "you're slowed" presentation (no dedicated freeze sheet
  // for unit abilities; spells/freeze is an uncertain identification).
  "bulwark-freezing-shot": { affect: [{ key: "slow" }], sound: "spells/slow" },
  // Behemoths' Crushing Blow / Corrosive Crush (and the WOG commander twin):
  // Defense is shredded for this attack — Disrupting Ray's beam is the H3
  // "armor stripped" cue.
  "behemoth-defense-crush-few": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "behemoth-defense-crush-pack": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  "commander-defense-crush": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  // Manticore Piercing Strike: ignore the target's printed Defense — same
  // "armor stripped" read as the Behemoth crush.
  "manticore-ignore-defense": { affect: [{ key: "disrupting-ray" }], sound: "spells/disrupting-ray" },
  // Ghost Dragon Knock Back: the shove itself (applyKnockback) fires the bare
  // ability id — the roll announce is `${id}-roll` and stays unmapped. Fear is
  // the H3 "shoved by terror" glyph.
  "ghost-dragon-knockback": { affect: [{ key: "fear" }], sound: "effects/fear" },
  // Ghost Dragon Aging (activation morale drain): the dedicated Age sheet.
  "ghost-dragon-morale-drain": { affect: [{ key: "age" }], sound: "effects/age" },
  // Factory Mechanics' Repair: mend an adjacent mechanical unit — the H3 repair
  // chime + the green Cure shimmer (same heal presentation as Enchanters).
  "mechanics-repair-1": { affect: [{ key: "cure" }], sound: "spells/repair" },
  "mechanics-repair-2": { affect: [{ key: "cure" }], sound: "spells/repair" },
  // Enchanters' activation heal. The +Attack fallback announces under
  // `${id}-buff` (unmapped) so this Cure shimmer only plays on a real heal.
  "enchanter-heal-or-buff": { affect: [{ key: "cure" }], sound: "spells/cure" },
  // WOG commander Regeneration (activation heal-self): same Cure shimmer as
  // Wraith/Troll Regeneration.
  "commander-regeneration": { affect: [{ key: "cure" }], sound: "spells/cure" },
  // Archangel lethal-save readiness: the real Resurrection sheet (not Prayer)
  // when the Archangel commits to cancel a killing blow. The cancel itself
  // also fires the shared "resurrection" ability plan with the same sheet.
  "archangel-lethal-save": { affect: [{ key: "resurrection" }], sound: "spells/resurrection" },
  // Future abilities (cards not implemented yet, assets ready):
  poison: { affect: [{ key: "poison" }], sound: "spells/poison" },
  paralyze: { affect: [{ key: "paralyze" }], sound: "spells/paralyze" },
  age: { affect: [{ key: "age" }], sound: "effects/age" },
  disease: { affect: [{ key: "disease" }], sound: "spells/disease" },
  bind: { affect: [{ key: "bind" }], sound: "effects/bind" },
  fear: { affect: [{ key: "fear" }], sound: "effects/fear" },
  "acid-breath": { hit: "acid-breath", hitSound: "effects/acid-breath" }
};

/**
 * Units whose ordinary ranged SHOT is a spell bolt rather than a plain arrow:
 * the table flies this projectile + hit sprite (with the spell's sound) instead
 * of the generic "bolt" cue. Keyed by the unit's bare name (the id without its
 * faction prefix), like the creature voices in unit-sounds.ts. The Santa Gremlin
 * "attacks with Ice Bolt" (its wog-santa-ice-bolt elemental attack), so its shot
 * IS the Ice Bolt — the same projectile/burst/sound the Ice Bolt spell and the
 * Faerie Dragon fire.
 */
export const unitShotFxPlans: Record<string, SpellFxPlan> = {
  santa_gremlin: {
    projectile: "ice-bolt-projectile-0",
    hit: "ice-bolt-hit",
    sound: "spells/ice-bolt",
    hitSound: "spells/ice-bolt-hit"
  }
};

/** The shot FX plan for a unit's ranged attack, or undefined for a plain arrow. */
export function unitShotFxPlan(unitDefId: string | undefined): SpellFxPlan | undefined {
  if (!unitDefId) {
    return undefined;
  }
  const bareName = unitDefId.split(".")[1] ?? unitDefId;
  return unitShotFxPlans[bareName];
}

/**
 * Heals that are NOT cast as spells and so have no SPELL_CAST_RESOLVED to carry
 * a sprite + sound — keyed by the source card. The First Aid Tent is the one in
 * play today: its per-round heal otherwise floated a bare "+N" with no effect.
 * Spell heals (Cure) are intentionally absent: they animate through their spell
 * cast, and adding them here would play the cure twice.
 */
export const healFxPlans: Record<string, SpellFxPlan> = {
  // The First Aid Tent mends a stack: the green Cure shimmer + heal chime, the
  // same cue Heroes III plays when the tent patches a unit up.
  "war_machine.first_aid_tent": { affect: [{ key: "cure" }], sound: "spells/cure" },
  // The First Aid ability card (basic side) removes 1 damage from a chosen
  // unit. It heals outside the spell flow too — its DAMAGE_HEALED carries the
  // card id as the source — so it would otherwise float a bare "+1" in silence.
  // Reuse the Tent's cure shimmer + chime so the played card actually sounds
  // like a heal.
  "ability.first_aid": { affect: [{ key: "cure" }], sound: "spells/cure" }
};

/**
 * War machines that FIRE a shot in combat — the Ballista, Catapult and Cannon —
 * play their own Heroes III shot at the WAR_MACHINE_TRIGGERED cue (see page.tsx),
 * just before the struck unit's hurt cry lands on the DAMAGE_ASSIGNED that
 * follows. Sound-only: the converted library has no shot sprite for these (the
 * floating damage number is the visual), so each plan carries just its measured
 * shot clip. The First Aid Tent is deliberately absent — it heals rather than
 * fires and carries its cue through `healFxPlans` — and the Ammo Cart is a
 * passive ranged buff that never fires a shot of its own.
 */
export const warMachineFxPlans: Record<string, SpellFxPlan> = {
  "war_machine.ballista": { sound: "units/ballista-shoot" },
  "war_machine.catapult": { sound: "units/catapult-shoot" },
  "war_machine.cannon": { sound: "units/cannon-shoot" }
};

/**
 * Ability/permanent cards that deal damage as a fired SHOT rather than a Spell:
 * the Artillery ability directs a Ballista-style volley at the lowest-initiative
 * enemy. Its DAMAGE_ASSIGNED (source = the card) carries the shot sound — the
 * same H3 Ballista report the war-machine Ballista uses — played just before the
 * struck unit's hurt cry + damage number (see page.tsx), so the shot is heard
 * first. Sound-only, like the war-machine shots: the floating damage is the
 * visual. Keyed by source card id, mirroring `healFxPlans`.
 */
export const cardShotFxPlans: Record<string, SpellFxPlan> = {
  "ability.artillery": { sound: "units/ballista-shoot" },
  // Ballistics' expert bombardment fires the siege Catapult's report on each
  // hit (primary + the adjacent splash), both logged as card-sourced
  // DAMAGE_ASSIGNED events keyed to this card id.
  "ability.ballistics": { sound: "units/catapult-shoot" }
};

// ---------------------------------------------------------------------------
// Presentation timing: how long a spell/ability's animation AND sound take, so
// the damage / death / heal it causes can be held back until both have fully
// played. The numbers come straight from the converted assets (sprite frame
// counts, measured MP3 lengths) so they can never drift out of sync with what
// the player actually sees and hears.
// ---------------------------------------------------------------------------

const SOUND_MS = soundDurations as Record<string, number>;

/** Playback length of a converted sound in ms (0 when unknown/missing). */
export function soundDurationMs(key: string | undefined): number {
  if (!key) {
    return 0;
  }
  return SOUND_MS[key] ?? 0;
}

/**
 * A single-frame sheet (e.g. the lightning bolt still) is flashed with a fade
 * rather than shown for one fps tick — see runSprite in components/table/fx.tsx.
 */
export const SINGLE_FRAME_FLASH_MS = 480;

/**
 * Upper bound on a projectile's flight. runProjectile scales the flight by
 * distance but caps it here, so using the cap keeps the damage gate safe (it
 * can only ever wait a touch too long, never resolve before the bolt lands).
 */
export const MAX_PROJECTILE_FLIGHT_MS = 560;

/**
 * Safety bound on the whole gate so a freak overlong clip can never stall the
 * table. It sits above every real spell/ability cue today — the longest damage
 * presentation (the Faerie Dragon's Ice Bolt) lands near 2.0s, and the very
 * longest sound of any kind (Azure Dragon's Fear, a no-damage debuff) is ~3.4s
 * — so it never trims one in practice.
 */
export const MAX_PRESENTATION_MS = 3600;

/** How long a sprite sheet plays on screen, in ms. */
export function spriteDurationMs(key: string | undefined): number {
  if (!key) {
    return 0;
  }
  const sheet = getFxSheet(key);
  if (!sheet) {
    return 0;
  }
  return sheet.frames <= 1 ? SINGLE_FRAME_FLASH_MS : Math.round((sheet.frames / sheet.fps) * 1000);
}

/**
 * The four presentation segments a plan can contribute, mirroring exactly how
 * queueBoardFx / the ability cue builder schedule them (projectile XOR hit,
 * then affect, then tint). Each segment lasts until BOTH its sprite work and
 * the sound playing under it have finished.
 */
function projectileSegmentMs(plan: SpellFxPlan): number {
  const flight = MAX_PROJECTILE_FLIGHT_MS;
  // The cast sound fires as the bolt launches; the hit sprite + hit sound land
  // when it arrives (after the flight).
  return Math.max(
    flight + spriteDurationMs(plan.hit),
    soundDurationMs(plan.sound),
    flight + soundDurationMs(plan.hitSound)
  );
}

function hitSegmentMs(plan: SpellFxPlan): number {
  // queueBoardFx plays hitSound ?? sound under a bare hit sprite.
  return Math.max(spriteDurationMs(plan.hit), soundDurationMs(plan.hitSound ?? plan.sound));
}

function affectSegmentMs(plan: SpellFxPlan): number {
  if (!plan.affect || plan.affect.length === 0) {
    return 0;
  }
  const spriteEnd = Math.max(
    ...plan.affect.map((entry) => (entry.delayMs ?? 0) + spriteDurationMs(entry.key))
  );
  // The cast sound plays under the first affect sprite.
  const soundEnd = (plan.affect[0].delayMs ?? 0) + soundDurationMs(plan.sound);
  return Math.max(spriteEnd, soundEnd);
}

/** Bloodlust-style tints have no sprite; the wash holds this long. */
export const TINT_HOLD_MS = 900;

function tintSegmentMs(plan: SpellFxPlan): number {
  if (!plan.tint) {
    return 0;
  }
  return Math.max(TINT_HOLD_MS, soundDurationMs(plan.sound));
}

/**
 * Total time a spell/ability's board presentation (sprites + the sounds layered
 * under them) takes, from the moment it begins. The damage number, a slain
 * unit's fall and any heal are all held until this elapses, so an effect never
 * resolves on the board before the player has seen and heard it.
 */
export function spellPresentationMs(plan: SpellFxPlan | undefined): number {
  if (!plan) {
    return 0;
  }
  let total = 0;
  if (plan.projectile) {
    total += projectileSegmentMs(plan);
  } else if (plan.hit) {
    total += hitSegmentMs(plan);
  }
  total += affectSegmentMs(plan);
  total += tintSegmentMs(plan);
  // A sound-only plan (e.g. Summon Elemental) still has a presentation: the
  // cast sound. Floor the gate at it so it is never reported as instantaneous.
  if (total === 0) {
    total = soundDurationMs(plan.sound);
  }
  return Math.min(MAX_PRESENTATION_MS, total);
}
