import type { CombatTokenKind, EffectDurationDefinition, SpellSchool, UnitType } from "@/engine/state";

export type UnitAbilityEffectDefinition =
  | { type: "ALLOW_UNLIMITED_RETALIATION" }
  | { type: "RETALIATION_ATTACK_BONUS"; amount: number }
  | { type: "IGNORE_RETALIATION" }
  | {
      /** Masato the Wall: intercept one normal attack on an adjacent ally per combat. */
      type: "INTERCEPT_ADJACENT_ATTACK_ONCE";
    }
  // Ranged combat-penalty waivers. A ranged attack rolls at disadvantage in two
  // distinct cases: (1) striking an ADJACENT unit (the "combat penalty against
  // adjacent units"), and (2) shooting from the back row across to the opposite
  // back row (the long-range / behind-wall penalty). These are two separate
  // abilities so a unit whose card reads "ignore the combat penalty against
  // adjacent units" (Evil Eyes, Medusas, Zealots, Titans) waives ONLY case (1),
  // while a unit whose card reads "ignore the combat penalties" (Magi,
  // Sharpshooters, Halflings) waives BOTH.
  | { type: "IGNORE_RANGED_MELEE_PENALTY" }
  | { type: "IGNORE_RANGED_PENALTIES" }
  | { type: "MOVE_ANYWHERE" }
  | { type: "UNIT_MOVE_RANGE_BONUS"; amount: number }
  | {
      /** Veterancy: treat this unit as Flying for ordinary combat movement. */
      type: "GRANT_FLYING_MOVEMENT";
    }
  | { type: "DEFENSE_REDUCTION_AFTER_MOVE"; amount: number }
  | { type: "DRAW_ON_DEFEAT_SIDE_OR_LAYER"; amount: number }
  | { type: "ON_ACTIVATION_ROLL_PARALYZE_RANDOM_ENEMY"; onRoll: number }
  | {
      /**
       * Jotunn Warlord (Bulwark, house rule): at the START of its activation the
       * controller may teleport one of its OTHER OWN units — a friendly unit,
       * NEVER itself and NEVER an enemy — to any empty space, exactly like the
       * Teleport Spell (same relocation, sound and card-glide). It is OPTIONAL
       * (a "Don't teleport" skip) and does NOT consume the activation: the Jotunn
       * still moves and attacks normally afterwards. Resolved interactively in
       * maybeOpenPlayerActivationChoice (pick a unit) → openTeleportChoice (pick
       * the empty space). No damage, no Retaliation — a pure relocation.
       */
      type: "TELEPORT_ANY_AT_ACTIVATION";
    }
  | {
      /**
       * Elemental units (Air/Earth/Fire/Water Elementals and their kin): "This
       * unit deals elemental damage." Its attack value cannot be raised by
       * attack cards or Attack tokens — only lowered by debuffs such as a
       * Sorceress' Weakness. A passive, always-on trait of the printed card.
       *
       * `rangedOnly` (WOG Santa Gremlin's Ice Bolt): the elemental hit is fired
       * only on a RANGED shot. A melee attack — in particular a forced melee
       * Retaliation Attack — rolls the Attack die normally (respecting Defense)
       * instead of dealing the un-rollable elemental damage. Threaded through
       * unitDealsElementalDamage via the current attack's `attackKind`.
       */
      type: "DEALS_ELEMENTAL_DAMAGE";
      rangedOnly?: boolean;
    }
  | {
      /**
       * Elemental units: "Immune to Magic Arrow and <element> Magic spells."
       * The unit cannot be targeted by — nor affected by — any Spell card whose
       * school appears in this list. "any" is the school of Magic Arrow (the
       * only school-"any" Spell), so it represents the Magic-Arrow immunity;
       * "air"/"earth"/"fire"/"water" cover that school's Spells. Magic
       * Elementals list only "any" (Magic-Arrow immunity, no school immunity).
       */
      type: "IMMUNE_TO_SPELL_SCHOOLS";
      schools: SpellSchool[];
    }
  | { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL"; maxRoll: number; amount: number }
  | {
      /**
       * Token "other action" (Ogres' Attack token, Few Sorceresses' Weakness
       * token): used instead of attacking, places a combat token on a unit.
       */
      type: "PLACE_TOKEN_ACTION";
      token: CombatTokenKind;
      /** Signed delta carried by the token (+2 attack, −2 weakness, …). */
      amount: number;
      /** Which side may receive the token. */
      targets: "any" | "friendly" | "enemy";
      /** Allowed unit types of the target (omit for all). */
      targetTypes?: UnitType[];
      /** Combat rounds the token lasts (omit = until end of combat). */
      rounds?: number;
      /** MGQ Web the Field: only orthogonally adjacent units may be chosen. */
      adjacentOnly?: boolean;
      /** MGQ Web the Field: the source also readies its Defend die. */
      sourceDefenseToken?: boolean;
    }
  | {
      /** MGQ Pochi: use the activation to dig an obstacle in an adjacent empty cell. */
      type: "PLACE_ADJACENT_OBSTACLE_ACTION";
    }
  | {
      /** MGQ Sofia: spend this activation to heal or empower one adjacent ally. */
      type: "MGQ_WHITE_MAGIC_ACTION";
      healAmount: number;
      attackBonus: number;
    }
  | {
      /**
       * Token on attack (Pack Sorceresses' −1 Weakness, Pack Behemoths'
       * Corrosion): after this unit's attack, the target gains the token.
       */
      type: "ON_ATTACK_TOKEN";
      token: CombatTokenKind;
      amount: number;
      rounds?: number;
      /** Existing abilities default to firing even on a fully defended hit. */
      requiresDamageDealt?: boolean;
      /** Existing abilities default to the unit's own declared attack. */
      trigger?: "own-attack" | "retaliation";
    }
  | {
      /**
       * Mammoths' Thick Hide: +N Defense while this unit is defending (it holds
       * a Defense token). Added on top of the Defend die in resolveDefendBonus.
       */
      type: "DEFEND_BONUS";
      amount: number;
    }
  | {
      /**
       * Shamans' Air Shield: +N Defense against an attacker of a given unit type
       * ("ranged" = Air Shield, "ground-or-flying" = Shield). The unit-ability
       * twin of the DEFENSE_VS_ATTACKER_TYPE active-effect modifier; read in
       * getSelfAttackerTypeDefenseBonus during the attack maths.
       */
      type: "DEFENSE_VS_ATTACKER_TYPE";
      attackerType: "ground-or-flying" | "ranged";
      amount: number;
    }
  | {
      /** Innate Fire Shield: an adjacent attacker takes flat damage after striking this unit. */
      type: "FIRE_SHIELD_DAMAGE";
      amount: number;
    }
  | { type: "REDUCE_SPELL_SCHOOL_DAMAGE"; school: Exclude<SpellSchool, "any">; amount: number }
  | { type: "MINIMUM_ATTACK_DIE"; minimum: number }
  | { type: "INNATE_MAGIC_MIRROR" }
  | { type: "ASTROLOGERS_ROUND_FRENZY"; attackBonus: number }
  | {
      type: "ON_KILL_HEAL_AND_PERMANENT_HEALTH";
      amount: number;
      maxBonus: number;
      requiresNonUndead?: boolean;
    }
  | {
      /** MGQ Lisa: every defeated side/stack layer permanently raises this army card's max Health. */
      type: "ON_LETHAL_HIT_GAIN_PERMANENT_HEALTH";
      amount: number;
      maxBonus: number;
    }
  | { type: "ON_KILL_SUMMON_WEAK_COPY"; statPenalty: number; oncePerCombat: boolean }
  | { type: "ON_ATTACK_PLACE_FIRE_WALL"; damage: number }
  | { type: "REDUCE_ATTACK_DAMAGE_ON_DEFENSE_DIE"; onRoll: number; amount: number }
  | { type: "UNDEAD" }
  | { type: "ADD_NEUTRAL_GUARD"; unitDefId: string }
  | { type: "EXTRA_RESOURCE_DIE_ON_NEUTRAL_DEFEAT"; count: number }
  | {
      /**
       * Great Shamans' Freezing Shot: after this unit's attack, the target's
       * Initiative drops by `amount` (negative) through its next combat round.
       */
      type: "ON_ATTACK_INITIATIVE_DEBUFF";
      amount: number;
      /** Existing Freezing Shot behavior stays unconditional when omitted. */
      requiresDamageDealt?: boolean;
      /** Existing Freezing Shot defaults to the target's next combat round. */
      duration?: EffectDurationDefinition;
    }
  | {
      /** MGQ Lisa: living adjacent enemies suffer the signed Initiative shift. */
      type: "ADJACENT_ENEMY_INITIATIVE_AURA";
      amount: number;
    }
  | {
      /**
       * Factory Armadillos (Pack): "Whenever this unit's Initiative is increased
       * by an effect, increase it by an additional 1." Read in effectiveInitiative:
       * when the NET Initiative bonus this unit gets from active effects is
       * positive, one extra +1 is added on top. A net-zero or negative shift
       * (e.g. Slow) is never amplified — only genuine increases are.
       */
      type: "AMPLIFY_INITIATIVE_INCREASE";
    }
  | {
      /**
       * Yetis ("recover from negative effects"): at the start of its activation
       * the unit shakes off every negative ongoing effect on it and its
       * Weakness/Corrosion tokens. Resolved in clearOwnDebuffsAtActivation.
       */
      type: "CLEAR_OWN_DEBUFFS_ON_ACTIVATION";
    }
  | {
      /**
       * Cyclops siege ability ("other action"): destroy the Gate or a Wall —
       * the pack/neutral versions may also destroy the Arrow Tower. Works at
       * any range; automatically successful.
       */
      type: "DEMOLISH_FORTIFICATION";
      canTargetArrowTower: boolean;
    }
  | {
      /**
       * Magogs (pack/neutral): "When Magogs attack a target that is not
       * adjacent to them, they also deal 1 damage to a unit adjacent to the
       * target." One unit, chosen by the attacker, friend or foe (per the
       * wiki FAQ a lone adjacent friendly unit takes the hit). Mandatory when
       * a candidate exists.
       */
      type: "FLAT_DAMAGE_ADJACENT_TO_TARGET";
      amount: number;
      /** Printed condition: only fires when the target is not adjacent. */
      requiresNonAdjacentTarget: boolean;
    }
  | {
      /**
       * Cerberi (pack/neutral): "Additionally, deals 1 damage to another
       * enemy unit adjacent to Cerberi." Enemy units only, anchored to the
       * attacker, never the original target. Mandatory when one exists.
       */
      type: "FLAT_DAMAGE_ADJACENT_TO_SELF";
      amount: number;
    }
  | {
      /**
       * Factory Automaton (board game, Gamefound Faction Focus): "<Passive> When
       * this unit would be removed from Combat, deal `amount` damage to each
       * adjacent unit." Hits EVERY adjacent unit — friend AND foe — the instant
       * the Automaton leaves the board (lethal damage, a flip is not a removal).
       * Resolved at the removal chokepoint (markUnitRemovedIfNeeded), so a chain
       * of adjacent Automatons detonates in sequence. The controller's Frederick
       * specialty adds to `amount` via PlayerState.automatonDetonationBonus.
       */
      type: "ON_REMOVAL_DAMAGE_ADJACENT";
      amount: number;
      /**
       * Factory Automaton (Few) cube-scaled Detonate: "remove them [the faction
       * cubes on this unit] to inflict that much damage." When set, the blast is
       * the number of faction cubes riding the unit at removal (0–2) instead of
       * the fixed `amount` — so it fizzles with no cubes and grows as the player
       * banks them. The controller's Frederick bonus is still added on top.
       */
      perCube?: boolean;
    }
  | {
      /**
       * Hidden Leaf Jinchuriki "Chakra Burst" (plan §6.2 "Frenzy"): immediately
       * after an attack made by this unit resolves, deal `amount` EFFECT damage
       * to EVERY OTHER unit adjacent to this unit — friend AND foe. Effect
       * damage is NOT an attack: it provokes no Retaliation, is not reduced by
       * the target's Defense, and is not subject to per-attack damage caps
       * (Nix / Casters' CAP_DAMAGE_PER_ATTACK); a lethal splash routes through
       * the normal removal path (applyFlatAbilityDamage → markUnitRemovedIfNeeded,
       * so rebirth / Stack tokens / Pack→Few all fire). Fires on the unit's OWN
       * declared attacks ONLY — never on a Retaliation Attack, and never once
       * per follow-up of the multi-attack queue — so it triggers at most once
       * per declared attack, before the parked Retaliation (the same timing as
       * the Magog splash and every other post-attack follow-up).
       */
      type: "AFTER_ATTACK_SPLASH";
      amount: number;
      /**
       * Azur Lane "Full Barrage" variant: anchor the splash on the attack's
       * TARGET instead of the attacker — every other unit adjacent to the
       * struck unit takes the effect damage (the target itself never does; it
       * already took the attack). Omitted = the Chakra-Burst around-self read.
       */
      around?: "target";
      /** Splash ENEMY units only (the Chakra Burst hits friend AND foe). */
      enemiesOnly?: boolean;
    }
  | {
      /**
       * Azur Lane "Fleet Formation" (kansen veterancy): friendly units
       * ADJACENT to this unit gain `amount` Attack on their OWN declared
       * attacks (never on a Retaliation Attack — the wog-attack-when-attacking
       * convention). A LIVE positional aura read at attack resolution (the
       * commanderLiveAttackBonus precedent): the bonus applies only while the
       * attacker actually stands next to the living carrier, never the carrier
       * itself. Two adjacent carriers stack. Innate ability bonus — added
       * UNCLAMPED like Hatred, so an elemental attacker still receives it.
       */
      type: "ADJACENT_ALLY_ATTACK_AURA";
      amount: number;
    }
  | {
      /** Azur Lane Javelin: gains Attack while a friendly named ally is alive in Combat. */
      type: "ALLY_NAME_ATTACK_BONUS";
      allyName: string;
      amount: number;
    }
  | {
      /**
       * Heavenly Demon Palace "Blood Siphon" (NEW engine arm for this faction):
       * after an attack made by this unit RESOLVES AND DEALS DAMAGE (> 0), remove
       * `amount` damage from this unit. Distinct from the Vampire's
       * `ON_ATTACK_HEAL_SELF`, which heals unconditionally after any own attack —
       * Blood Siphon heals ONLY when the blow actually connects (a fully-soaked
       * 0-damage attack heals nothing). Fires on the unit's OWN attacks only,
       * never on a Retaliation Attack; capped at the damage currently on the unit.
       * Wired in reducer.ts (applyBloodSiphonSelfHeal in finishResolvedAttack),
       * pinned in heavenly-demon-abilities.test.ts.
       */
      type: "HEAL_SELF_ON_DAMAGE_DEALT";
      amount: number;
    }
  | {
      /**
       * Heavenly Demon Palace "Reap the Fallen" (NEW engine arm for this faction):
       * whenever ANY unit ADJACENT to this unit is removed from Combat (by any
       * source — an attack, a splash, a Spell, a detonation), this unit gains
       * `amount` Attack for the rest of the Combat. The bonus is baked onto the
       * combat unit's `permanentAttackBonus` so it survives a Pack→Few flip
       * (exactly like the Gelu buff) but is combat-scoped (never mirrored to the
       * army card). It escalates: every nearby death adds another `amount`. Wired
       * at the removal chokepoint in combat-units.ts (applyReapTheFallenOnRemoval
       * in markUnitRemovedIfNeeded), pinned in heavenly-demon-abilities.test.ts.
       */
      type: "ATTACK_BUFF_ON_ADJACENT_REMOVAL";
      amount: number;
    }
  | {
      /**
       * Liches (pack/neutral): "Choose a unit adjacent to the target and
       * attack it. For the purpose of this attack, your attack is 2." A full
       * separate attack — instant windows open for both sides, the attack
       * die rolls — that can and sometimes must hit friendly units or the
       * Liches themselves (wiki FAQ). It resolves before the original
       * target's retaliation and never chains another follow-up.
       */
      type: "SECOND_ATTACK_ADJACENT_TO_TARGET";
      baseAttack: number;
      /** Optional die face that gates the follow-up (Spider Mastermind: -1). */
      onRoll?: number;
    }
  | {
      /**
       * After the original attack, every other unit adjacent to this unit is
       * attacked with a full separate attack. Each follow-up opens instant
       * windows and rolls the die; none of them retaliates or chains further
       * follow-ups. Used by BINH Cerberi (fixed `baseAttack` 3, enemies only)
       * and the Conflux Magic Elementals ("Attack all adjacent [enemy] units":
       * the attacker's own buffable attack, `includeAllies` on the Few side).
       */
      type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF";
      /** Fixed attack for each follow-up; when omitted the attacker's own
       *  (possibly buffed) attack value is used. */
      baseAttack?: number;
      /** When true the follow-up also strikes adjacent FRIENDLY units (Magic
       *  Elementals Few "Attack all adjacent units"); otherwise enemies only. */
      includeAllies?: boolean;
    }
  | {
      /**
       * Wolf Raiders: after their target retaliates if possible, attack the
       * same target a second time. The follow-up does not provoke a second
       * retaliation.
       */
      type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION";
      /** Fixed Attack value for the follow-up; omitted uses the attacker's live Attack. */
      baseAttack?: number;
      /** Signed adjustment to the attacker's live Attack when no fixed value is supplied. */
      attackModifier?: number;
    }
  | {
      /**
       * Kudryavka Noumi: after the primary attack, make one full separate
       * attack against a seeded-random living enemy other than the original
       * target. The follow-up rolls its own die, opens reaction windows, and
       * cannot retaliate or chain another follow-up.
       */
      type: "SECOND_ATTACK_RANDOM_OTHER_ENEMY";
    }
  | {
      /** Doom Arachnotron: three attacks against the same target at fixed values. */
      type: "SEQUENCE_ATTACK_SAME_TARGET";
      followUpAttacks: number[];
    }
  | {
      /**
       * Thunderbirds / Wyverns: immediately after their attack, before
       * retaliation, roll one Attack die and deal flat damage to the target on
       * matching faces. The printed Stronghold Thunderbird card triggers on 0
       * or +1 (minRoll 0, no maxRoll); the Wyvern only on a "0" (minRoll 0,
       * maxRoll 0). The face must satisfy minRoll ≤ roll ≤ maxRoll (maxRoll
       * omitted means "no upper bound").
       */
      type: "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET";
      minRoll: number;
      maxRoll?: number;
      amount: number;
    }
  | {
      /**
       * Behemoths: the target's defense is lowered for this attack, never
       * below zero after all attack-window modifiers are counted.
       */
      type: "DEFENSE_REDUCTION_ON_ATTACK";
      amount: number;
    }
  | {
      /**
       * Every printed reroll ability is "[unit_attack]", so `rerollsPerAttack`
       * is a HARD per-attack budget: the source depletes as it is spent and
       * re-arms only on the NEXT declared attack (a printed follow-up counts as
       * its own attack). Never make one of these unlimited.
       */
      type: "ATTACK_DIE_REROLL";
      rerollsPerAttack: number;
      /**
       * Face gate — Crusaders: 'You can reroll every "0"'; neutral Minotaurs:
       * 'Reroll this unit's "-1" outcome'. The reroll is only offered while the
       * die shows this face. It gates WHEN, never HOW OFTEN: rerolling into
       * another matching face does NOT hand the unit a second use in the same
       * attack (2026-08-10 rule — "[unit_attack] abilities activate only once
       * per attack"). The Crusaders' printed "every" is read as "every die
       * showing 0 in this one roll", which the whole-roll reroll already covers.
       */
      onlyOnRoll?: number;
      /**
       * Castle Champions: "If this unit's movement ends in a space other than
       * where it started, you may reroll an Attack die." The reroll is only
       * offered when this unit moved during its own attack (never on a
       * Retaliation Attack, where it did not move).
       */
      requiresMoved?: boolean;
    }
  | {
      /**
       * Roll 2 Attack dice and resolve the higher outcome. Two printed
       * variants share this effect:
       *  - `[unit_passive] During any attack …` (neutral Crusaders): applies to
       *    EVERY attack this unit makes, including a Retaliation Attack.
       *  - `[unit_attack] Roll 2 Attack dice …` (neutral/Factory Halflings,
       *    neutral Leprechaun): the `[unit_attack]` icon fires ONLY on the
       *    unit's OWN declared attack, never on a Retaliation Attack — set
       *    `ownAttackOnly: true` so the advantage is dropped when retaliating.
       */
      type: "ATTACK_ROLL_ADVANTAGE";
      ownAttackOnly?: boolean;
      /** Optional retaliation-only variant (Doom Mancubus). */
      retaliationOnly?: boolean;
    }
  | {
      /**
       * Marksmen/Elves: after attacking a non-adjacent target, attack it
       * again. The follow-up happens once — never a third attack. With
       * maxRoll set, the second attack only triggers when the first attack's
       * die outcome was at or below it (Elves: -1 or 0).
       */
      type: "DOUBLE_ATTACK";
      maxRoll?: number;
      /** Veterancy variant: also works for adjacent/melee attacks. */
      anyRange?: boolean;
    }
  | {
      type: "ACTIVATION_ATTACK_BUFF";
      amount: number;
      targetTypes: UnitType[];
      duration: EffectDurationDefinition;
      endsActivation: boolean;
      preventsMovement: boolean;
    }
  | {
      /**
       * Neutral Magi: after this unit's attack, the defending player must
       * either discard a card of their choice that can contribute Power (a
       * Power statistic or any Spell, which can be discarded for "+1 Power"),
       * or let a random card be discarded from their hand. The choice belongs
       * to the defender; with no Power card the random discard is forced.
       */
      type: "ENEMY_DISCARDS_POWER_OR_RANDOM";
    }
  | {
      /**
       * Gold Dragons: "Attack 2 spaces in a line." After the primary attack,
       * a full separate attack strikes the unit directly behind the target
       * (the next space away from the dragon), friend or foe, at the printed
       * replacement attack value. That space is not adjacent to the dragon, so
       * the struck unit never retaliates, and the follow-up never chains.
       */
      type: "SECOND_ATTACK_BEHIND_TARGET";
      baseAttack: number;
      /** When true, deal `baseAttack` as fixed effect damage instead of rolling a second attack. */
      fixedDamage?: boolean;
    }
  | {
      /**
       * Azure Dragons (own attack die "-1") and Basilisks (an extra die "0"):
       * the struck target gains a Paralysis token. "own" reads the attack's
       * own resolved die; "extra" rolls one fresh Attack die after the attack.
       */
      type: "PARALYZE_TARGET_ON_DIE";
      source: "own" | "extra";
      onRoll: number;
    }
  | {
      /**
       * Hydras: "attacks up to 2 adjacent enemy units." After the primary
       * attack, one more enemy adjacent to the Hydra is hit with a full
       * separate attack (the attacker chooses when several qualify) at the
       * Hydra's own attack value — undefined baseAttack means "use the unit's
       * attack". That follow-up never retaliates or chains further.
       *
       * Cove Ayssids (Pack) set `requiresTargetRemoved`: the follow-up only
       * happens "if the target is reduced to 0 HP" — i.e. the primary attack
       * removed the original target from the board. A removed target can never
       * make a Retaliation Attack, so the Ayssids' "after resolving the
       * retaliation (if applicable)" timing is satisfied by firing immediately
       * (there is no retaliation to wait for). When the target merely flips a
       * Pack down to its Few side (still alive) the follow-up does NOT trigger.
       */
      type: "SECOND_ATTACK_ONE_ADJACENT_TO_SELF";
      baseAttack?: number;
      requiresTargetRemoved?: boolean;
    }
  | {
      /**
       * Cove Nix (Pack): "This unit cannot take more than N damage from a single
       * attack." A defensive cap applied to every individual attack against this
       * unit (the primary attack, each follow-up attack, and every Retaliation
       * Attack count as separate attacks). By default only attacks are capped —
       * Spell damage is unaffected unless `includeSpells` is true (Fuyuki
       * Casters: attack AND spell hits each cap at N).
       */
      type: "CAP_DAMAGE_PER_ATTACK";
      amount: number;
      /** When true, also cap a single Spell-card / spell-damage hit at `amount`. */
      includeSpells?: boolean;
    }
  | {
      /**
       * Cove Haspids (Few): "+N Attack if, during this Combat, this unit was
       * flipped from the Pack to the Few side." A flat Attack bonus on every
       * OWN declared attack the Few side makes — the card prints the
       * [unit_attack] icon, so it drops on a Retaliation Attack (the shared
       * `getInnateFlatAttackBonus` encodes that split; pinned in
       * unit-attack-retaliation-gating.test.ts) — and only once the unit has
       * actually been knocked down from its Pack side this combat (tracked by
       * `flippedDownThisCombat`). A fresh-recruited Few gets nothing.
       */
      type: "ATTACK_BONUS_IF_FLIPPED";
      amount: number;
    }
  | {
      /**
       * Cove Seamen (Pack): "Once per Combat, when this unit removes a unit from
       * Combat, gain N gold." When one of this unit's attacks (or Retaliation
       * Attacks) destroys a unit — actually removing it from the board, never a
       * mere Pack→Few flip — its controller gains `amount` of the resource, once
       * per combat per Seamen stack.
       */
      type: "ON_KILL_GAIN_RESOURCE";
      resource: "gold" | "buildingMaterials" | "valuables";
      amount: number;
    }
  | {
      /**
       * Medusas: paralysis inflicted by THIS unit's Retaliation Attack. The
       * Pack/Neutral cards paralyse automatically ("The target gains
       * Paralysis"); the Few card first rolls an Attack die and only paralyses
       * on `onRoll` ("After the Retaliation Attack, roll an Attack die, on a
       * '0' the target is Paralysis"). The token lands on the unit the
       * Medusas retaliated against, if it is still alive.
       */
      type: "PARALYZE_ON_RETALIATION";
      /** When set, roll one Attack die and only paralyse on this face. */
      onRoll?: number;
    }
  | {
      /**
       * Dread Knights: "When this unit is targeted by a Retaliation Attack, it
       * gains +N Defense." The bonus only applies while this unit is the
       * defender of a retaliation (i.e. the original attacker being struck
       * back).
       */
      type: "DEFENSE_BONUS_WHEN_RETALIATED";
      amount: number;
    }
  | {
      /**
       * Dragon Flies: "Retaliation Attacks against Dragon Flies suffer -N
       * Attack." The penalty hits whoever retaliates against this unit (the
       * retaliation's attacker), only while this unit is the retaliation's
       * target.
       */
      type: "RETALIATION_AGAINST_ATTACK_PENALTY";
      amount: number;
    }
  | {
      /**
       * Necropolis Dread Knights (Few): "When retaliating after this attack,
       * the enemy rolls 2 Attack dice and resolves the lower result." The
       * Retaliation Attack against this unit rolls at disadvantage.
       */
      type: "RETALIATION_AGAINST_DISADVANTAGE";
    }
  | {
      /**
       * WOG Nightmare: "[unit_passive] When this unit is attacked, the attacker
       * rolls 2 Attack dice and resolves the LOWER result." A defender-side Fear
       * that forces the incoming attack to roll at disadvantage. It fires only on
       * a real attack ON the Nightmare — never on the Nightmare's own Retaliation
       * Attack, and never on a foe's retaliation back against the Nightmare (a
       * Retaliation Attack is not "attacking" it). Read via the `defender` param
       * of getAttackRollMode, gated on `!isRetaliation`.
       */
      type: "FEAR_ATTACKER_DISADVANTAGE";
    }
  | {
      /**
       * Ghost Dragons (Pack): "[unit_attack] Add +N to your Attack die
       * result." A flat bonus added to every attack (and Retaliation Attack)
       * this unit makes, counted alongside the rolled die.
       */
      type: "ATTACK_DIE_RESULT_BONUS";
      amount: number;
    }
  | {
      /**
       * Ghost Dragons: "[activation] Discard the enemy's positive morale
       * token." When this unit activates, the opposing player's positive
       * morale token (if any) is discarded.
       */
      type: "ON_ACTIVATION_DISCARD_ENEMY_MORALE";
    }
  | {
      /**
       * Wraiths / Trolls: "[activation] Remove up to N damage from this unit."
       * Self-regeneration applied automatically when the unit activates.
       */
      type: "ON_ACTIVATION_HEAL_SELF";
      amount: number;
    }
  | {
      /**
       * Wraiths (Pack): "[activation] …then discard N random card(s) from the
       * enemy's hand." Resolved when the unit activates.
       */
      type: "ON_ACTIVATION_DISCARD_ENEMY_CARD";
      count: number;
    }
  | {
      /**
       * Archangels (Few): "[unit_passive] When combat begins, draw N card(s)."
       * The controller draws from their own deck once the combat's first round
       * starts.
       */
      type: "ON_COMBAT_START_DRAW";
      amount: number;
    }
  | {
      /**
       * Disciplinary Committee Pack: at combat start its controller chooses one
       * living enemy. That target gets the Attack delta through round 1 only.
       */
      type: "ON_COMBAT_START_ENEMY_ATTACK_PENALTY";
      amount: number;
      rounds: number;
    }
  | {
      /**
       * Enchanters: "[activation] Remove up to `healAmount` damage from a
       * friendly unit. Otherwise, gain +`attackBonus` Attack." Per the wiki Note
       * the heal is MANDATORY whenever it is possible ("the healing effect can
       * not be skipped in favor of +1 Attack"): while a wounded *other* friendly
       * unit exists the controller must heal one of them (a neutral heals its
       * most-wounded ally); the +`attackBonus` self-buff (for the current combat
       * round) is taken only when there is nothing to heal. Enchanters can never
       * heal themselves. It never ends the activation: the unit still moves and
       * attacks afterwards.
       */
      type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF";
      healAmount: number;
      /**
       * The self Attack buff taken only when there is nothing to heal. Factory
       * Mechanics FEW set this to 0 (their card has no "+Attack" alternative) —
       * with no valid repair target the Few activation simply does nothing.
       */
      attackBonus: number;
      /**
       * Factory Mechanics: the repair target must be ADJACENT to this unit
       * (Enchanters heal at any range, so they leave this unset).
       */
      adjacentOnly?: boolean;
      /**
       * Factory Mechanics: the repair target must be a "mechanical" unit
       * (Automatons / Dreadnoughts). Enchanters heal any friendly, so unset.
       */
      targetTrait?: "mechanical";
    }
  | {
      /**
       * Faerie Dragons: "[activation] The selected unit suffers `amount`
       * damage. This is a spell that does not count towards your spell limit."
       * On activation the unit deals flat spell damage to a chosen target
       * (a neutral picks it like a normal attack), then acts normally. The
       * client plays the Ice Bolt projectile + sound for the hit.
       */
      type: "ON_ACTIVATION_DAMAGE_SPELL";
      amount: number;
    }
  | {
      /** Doom Revenant: damage the chosen target immediately before the attack. */
      type: "ON_ATTACK_PRE_DAMAGE";
      amount: number;
    }
  | {
      /**
       * Harpies: "[unit_attack] After the enemy's Retaliation Attack, this
       * unit can return to the space from which it moved to attack." Once the
       * attack (and any retaliation) resolves, the harpy may fly back to the
       * space it started its activation on. A neutral always returns; a player
       * chooses. Optional repositioning — never an extra attack.
       */
      type: "RETURN_TO_ORIGIN_AFTER_ATTACK";
    }
  | {
      /**
       * Pit Lords (Pack): "[unit_other] If one of your units has been removed
       * from the board during this Combat, Summon or Reinforce Demons." As an
       * other action (instead of moving/attacking, once per combat) the
       * controller either summons a Few of `demonUnitDefId` onto an empty
       * adjacent space or reinforces a friendly Few of them up to a Pack at no
       * cost. The summoned/reinforced unit joins the army after the combat.
       */
      type: "SUMMON_OR_REINFORCE_DEMONS";
      demonUnitDefId: string;
    }
  | {
      /**
       * Troglodytes / Gargoyles: "This unit ignores Paralysis effects." The
       * unit can never gain a Paralysis token, so it never skips an activation
       * from one (it is simply not placed).
       */
      type: "IGNORE_PARALYSIS";
    }
  | {
      /**
       * "Hatred" bonus (Archangels ↔ Arch Devils, Genies → Efreet, Titans →
       * Black Dragons): "When attacking <unit>, this unit gains +N Attack."
       * A flat Attack bonus that applies whenever this unit attacks a unit
       * whose creature name matches `unitName`.
       */
      type: "ATTACK_BONUS_VS_UNIT_NAME";
      unitName: string;
      amount: number;
    }
  | {
      /**
       * Factory Bounty Hunters: "At the start of Combat, place a Mark token on an
       * enemy unit. Bounty Hunters gain +N Attack against Marked units." Two hooks
       * off one ability: at combat start it Marks an enemy (applyCombatStartUnit-
       * Abilities), and on every attack a Bounty Hunter makes against a Marked unit
       * it adds `attackBonus` to its Attack. Few +1, Pack +2.
       */
      type: "MARK_AND_HUNT";
      attackBonus: number;
    }
  | {
      /**
       * Zombies / Manticores: "If the attacker resolves a <face> on the Attack
       * die, gain +N Defense." A defender-side bonus applied for the incoming
       * attack only, when that attack's resolved die is within [minRoll,
       * maxRoll].
       */
      type: "DEFENSE_BONUS_ON_ATTACK_DIE";
      minRoll: number;
      maxRoll: number;
      amount: number;
    }
  | {
      /**
       * Dread Knights (Pack): "If you resolve a 0 or +1 on the Attack die,
       * increase this unit's total Attack by another +1." An attacker-side
       * bonus added to the attack value when this unit's own resolved die is
       * within [minRoll, maxRoll].
       */
      type: "ATTACK_BONUS_ON_ATTACK_DIE";
      minRoll: number;
      maxRoll: number;
      amount: number;
    }
  | {
      /**
       * Manticores (Pack): "For this attack, ignore the Defense value from the
       * target unit's card." The target's printed Defense is treated as 0 for
       * this attack (Defense tokens and other bonuses still apply).
       */
      type: "IGNORE_TARGET_CARD_DEFENSE";
    }
  | {
      /**
       * Rust Dragons: "On a -1 result on the Attack die, decrease the target's
       * Defense by N (to a minimum of 0)." After the attack, when its own
       * resolved die equals `onRoll`, place the token on the target (a
       * Corrosion token lasts the whole combat and is capped so Defense never
       * drops below 0).
      */
      type: "ON_ATTACK_DIE_TOKEN";
      /** One exact triggering face. Legacy Rust Dragon/Halfling form. */
      onRoll?: number;
      /** Inclusive triggering range. Used when more than one adjacent face triggers. */
      minRoll?: number;
      maxRoll?: number;
      token: CombatTokenKind;
      amount: number;
      /** Number of identical tokens placed by one trigger (default 1). */
      count?: number;
    }
  | {
      /** MGQ status payoff: flat Attack while the target carries any listed token. */
      type: "ATTACK_BONUS_VS_TARGET_TOKENS";
      amount: number;
      tokens: CombatTokenKind[];
    }
  | {
      /** MGQ Devour: removing a status-marked target side restores all damage. */
      type: "ON_KILL_HEAL_FULL_IF_TARGET_TOKEN";
      tokens: CombatTokenKind[];
    }
  | {
      /**
       * Gorgons: "After the attack, roll `diceCount` Attack dice; on all
       * `onRoll` results, reduce the target's Health to 0." A death stare that
       * destroys the target's current side outright (a Pack flips to its Few
       * side as usual) when every rolled die shows `onRoll`.
       */
      type: "DEATH_STARE_ON_DICE";
      diceCount: number;
      onRoll: number;
      /**
       * Raid-boss Devour: the stare only threatens target sides of at most
       * this tier (gradeless targets — bank cards, commanders, summons,
       * bosses — are never threatened). Absent = any target (classic Gorgon).
       */
      targetGradeAtMost?: "bronze" | "silver" | "gold" | "azure";
    }
  | {
      /**
       * Raid-boss Fear (§6.8): while a living ENEMY unit carries this, the
       * player cannot USE morale — the +1 morale token and held Positive
       * Morale cards cannot be spent (reroll / set-die sources, redraw,
       * combat bonus, token removal, the reaction-window bonus). Morale is
       * still GAINED and morale-card draws still happen; only the use is
       * locked (moraleLockedForPlayer in unit-abilities.ts).
       */
      type: "MORALE_LOCK";
    }
  | {
      /**
       * Archangels (Pack): "Once per Combat. Cancel an attack that would reduce
       * another unit's HP to 0." A free, grade-agnostic lethal save offered to
       * the controller in the lethal-save window — for any other friendly unit,
       * once per combat per Archangel stack.
       */
      type: "CANCEL_LETHAL_UNIT_ABILITY";
    }
  | {
      /**
       * Dragon Flies: on attack, remove every ongoing effect the target's own
       * controller placed on the target (attack/defense/initiative buffs,
       * Anti-Magic, etc.) — a dispel of the enemy's own enhancements. Debuffs
       * the attacker placed on the target are left in place.
       */
      type: "DISPEL_ENEMY_EFFECTS_ON_TARGET";
    }
  | {
      /**
       * Iron/Gold/Diamond Golems, neutral Black Dragons: "Reduce any damage
       * from spells by N (to a minimum of 0)." A passive applied to every
       * instance of Spell damage the unit takes — direct damage spells, area
       * spells and the Faerie Dragon's bolt — before it is added to the unit's
       * damage. Independent of the Elementals' school immunity.
       */
      type: "REDUCE_SPELL_DAMAGE";
      amount: number;
    }
  | {
      /**
       * Steel Golems: "Reduce damage taken by this unit from spell or Specialty
       * by N — to a minimum of 0." Like the Iron/Gold/Diamond Golems' spell
       * reduction, but it also softens Hero-Specialty damage (Xyron's Inferno,
       * Solmyr's Chain Lightning). Counts toward both getSpellDamageReduction
       * and getSpecialtyDamageReduction.
       */
      type: "REDUCE_SPELL_AND_SPECIALTY_DAMAGE";
      amount: number;
    }
  | {
      /**
       * Ghost Dragons (neutral): "[unit_attack] After the attack, roll 1 Attack
       * die; if the result is `onRoll`, the target must immediately move away 1
       * space." The defender picks an empty space adjacent to the target that is
       * not adjacent to the Ghost Dragons; a neutral target is moved
       * automatically. Being shoved out of reach means the target can no longer
       * make its Retaliation Attack. With no valid space the target stays put
       * and retaliates as normal.
       */
      type: "KNOCKBACK_AFTER_ATTACK";
      onRoll: number;
    }
  | {
      /**
       * Vampires: "[unit_attack] …then remove up to N damage from this unit."
       * After this unit's own attack (never a Retaliation Attack) it heals
       * itself by up to `amount`.
       */
      type: "ON_ATTACK_HEAL_SELF";
      amount: number;
    }
  | {
      /**
       * Phoenixes: "Once per Combat, when this unit's HP drops to 0, set it to
       * 1 instead." An automatic self-rebirth taken the moment a lethal blow
       * (from any source) would remove the unit, leaving it alive at 1 Health.
       */
      type: "SELF_REBIRTH_ONCE";
    }
  | {
      /** MGQ Hero Job: one death-save roll per combat; succeeds at or below maxRoll. */
      type: "SELF_REBIRTH_ROLL_ONCE";
      maxRoll: number;
    }
  | {
      /** MGQ Gadabout Job: extra veteran XP after this unit survives a won combat. */
      type: "BONUS_UNIT_EXPERIENCE";
      amount: number;
    }
  | {
      /** MGQ Maid Job: live, non-sticky Initiative aura for adjacent friendly units. */
      type: "FRIENDLY_ADJACENT_INITIATIVE_AURA";
      amount: number;
    }
  | {
      /** MGQ Mage Job: once-per-combat targeted damage before moving. */
      type: "MGQ_MAGE_MAGIC_ARROW_ACTION";
      amount: number;
    }
  | {
      /** MGQ Hunter Job: pierce Defense when the own Attack die is in range. */
      type: "DEFENSE_REDUCTION_ON_ATTACK_DIE";
      minRoll: number;
      maxRoll: number;
      amount: number;
    }
  | {
      /**
       * Neutral Halberdiers: "Treat allied adjacent units as if they had a
       * Defense token." While this unit is alive, every friendly unit adjacent
       * to it rolls the Defend die when attacked (a "+1" face grants +1
       * Defense), exactly as a real Defense token would, without spending an
       * action.
       */
      type: "DEFENSE_TOKEN_AURA";
    }
  | {
      /**
       * Familiars: "Whenever an enemy casts a spell from hand, they must
       * discard 1 card from hand." A passive tax: while a living Familiar is on
       * the opposing side, each Spell an enemy casts from hand costs them one
       * extra card of the caster's choice from hand.
       */
      type: "SPELL_CAST_HAND_TAX";
    }
  | {
      /**
       * Neutral Pegasi: "Whenever an enemy casts a spell, they must discard an
       * additional card with Power." A GATING COST: while a living enemy Pegasi
       * is in the combat, the enemy may cast a Spell (from hand OR a Scroll) ONLY
       * by also discarding a Power-bearing card (a Power statistic or any Spell)
       * — with no spare Power card to pay, the cast is not legal at all. The
       * caster chooses which Power card to pay through a prompt (COMBAT_HAND_DISCARD,
       * kind "pegasi-toll") and the Spell is cast once the toll is paid.
       */
      type: "SPELL_CAST_POWER_TAX";
    }
  | {
      /**
       * Neutral Champions ([unit_attack], attack-only): "Roll 2 Attack dice and
       * apply both outcomes." Both dice are summed into the attack's die result.
       * This is the ATTACK-triggered half only — the "-1" reroll is a SEPARATE
       * always-on passive (`REROLL_ALL_MINUS_ONE`) so it also covers this unit's
       * Defend die and any morale-reduced single die, not just this 2-dice roll.
       */
      type: "ROLL_TWO_DICE_APPLY_BOTH";
      /** The Doom Sergeant also applies the two-dice roll while retaliating. */
      retaliationAlso?: boolean;
    }
  | {
      /**
       * Neutral Champions ([unit_passive], always on): "Reroll this unit's all
       * '-1' rolls." EVERY Attack/Defend die this unit rolls rerolls a "-1"
       * face — repeatedly, until it is not "-1" (the card's "all", confirmed by
       * the wiki note that it rerolls "even multiple times"). Independent of the
       * attack-only 2-dice roll above, so it applies whenever the unit rolls.
       */
      type: "REROLL_ALL_MINUS_ONE";
    }
  | {
      /**
       * Mummies (offence): "Ignore the result on the Attack die." This unit's
       * own attacks always resolve as if the die showed 0 (the die is not
       * rolled / its face is discarded).
       */
      type: "IGNORE_OWN_ATTACK_DIE";
    }
  | {
      /**
       * Mummies (defence): "Whenever this unit is attacked, set the opponent's
       * Attack die to `value`." While this unit is the defender, the attacker's
       * resolved die is forced to `value` (-1 for Mummies).
       */
      type: "FORCE_ATTACKER_DIE";
      value: number;
    }
  | {
      /**
       * Castle Halberdiers (Pack): "[unit_passive] When the unit is targeted by
       * any attack, you can discard a card and ignore the Attack die's roll
       * result." A DEFENDER-side optional reaction in the post-roll die-cancel
       * window: while this unit is the defender and the Attack die settled on a
       * "+1" (the only face worth cancelling), its controller may discard one
       * card from hand to treat the die as 0 (cancelling its +1 and any face-
       * triggered effects) — the same `attackDieCancelled` the Shield of the
       * Dwarven Lords arms. The discard is the cost (a random card from hand).
       */
      type: "DISCARD_TO_IGNORE_ATTACK_DIE";
    }
  | {
      /**
       * Azure Dragons / Black Dragons (Pack): "ignore damage from Specialty."
       * This unit takes no damage from Hero Specialty cards; non-damage
       * Specialty effects (buffs/debuffs) still apply.
       */
      type: "IMMUNE_TO_SPECIALTY_DAMAGE";
    }
  | {
      /**
       * Fortress Wyverns: "[unit_attack] Place N faction cube(s) on the target.
       * At the beginning of its every activation, remove 1 of them to inflict 1
       * damage." A poison-style damage-over-time — the cubes ride the struck
       * unit and bleed it for 1 each time it activates until they run out. Cubes
       * from repeated Wyvern hits accumulate on the same target.
       */
      type: "ON_ATTACK_POISON_CUBES";
      count: number;
    }
  | {
      /** Doom Cacodemon: place poison cubes only on matching own attack rolls. */
      type: "ON_ATTACK_DIE_POISON_CUBES";
      minRoll: number;
      maxRoll?: number;
      count: number;
    }
  | {
      /** Doom Pain Elemental: summon a neutral unit after each own attack. */
      type: "SUMMON_UNIT_ON_ATTACK";
      unitDefId: string;
    }
  | {
      /**
       * Rampart Dwarves: "[unit_passive] If this unit is targeted by any Spell
       * or Specialty card, roll 1 Attack die. On a '+1' result, ignore the
       * card's effect." The die is rolled whether the card is friendly or
       * hostile; on a matching face the whole card has no effect on this unit.
       */
      type: "NEGATE_CARD_ON_DIE";
      onRoll: number;
    }
  | {
      /**
       * Rampart Pegasi (Pack): "[unit_passive] The Power of all enemy spells is
       * reduced by N (to a minimum of 0)." A passive aura: while this unit
       * lives, every Spell cast by the opposing side resolves at `amount` less
       * Power.
       */
      type: "REDUCE_ENEMY_SPELL_POWER";
      amount: number;
    }
  | {
      /**
       * Rampart Unicorns (Pack): "Reduce any damage from spells dealt to this
       * and adjacent friendly unit(s) by N." An aura — the reduction protects
       * the Unicorns themselves and every friendly unit adjacent to them. The
       * Few side instead carries a self-only REDUCE_SPELL_DAMAGE.
       */
      type: "REDUCE_SPELL_DAMAGE_AURA";
      amount: number;
    }
  | {
      /**
       * Komari Kamikita: reduce spell and Hero-Specialty damage dealt to this
       * unit and every adjacent unit, regardless of controller.
       */
      type: "REDUCE_SPELL_AND_SPECIALTY_DAMAGE_AURA";
      amount: number;
    }
  | {
      /**
       * Rampart Dendroids (Pack): "[unit_passive] Enemy units that start their
       * activation adjacent to this unit cannot move." A Bind aura, evaluated at
       * the start of each enemy activation; a bound unit may still attack.
       */
      type: "BIND_ADJACENT_ENEMIES";
    }
  | {
      /**
       * Tower Gargoyles: "[unit_passive] This unit ignores any ongoing Spell
       * effects." Ongoing effects created by a Spell card never apply to this
       * unit (friendly or hostile); ongoing effects from other sources
       * (artifacts, specialties) still apply.
       */
      type: "IGNORE_ONGOING_SPELL_EFFECTS";
    }
  | {
      /**
       * Tower Titans: "[unit_passive] Ignore any ongoing effects on this unit."
       * Every ongoing effect — created by a Spell, Artifact or Specialty,
       * friendly or hostile — is ignored while it would apply to this unit.
       */
      type: "IGNORE_ONGOING_EFFECTS";
    }
  | {
      /**
       * Tower Genies: "Discard up to N cards from your deck and take a Spell
       * discarded this way to your hand." The Few uses it as an other action
       * (instead of moving/attacking); the Pack triggers it after its attack.
       * The deck reshuffles its discard pile to complete the count if it runs
       * out; among the discarded Spells the controller takes one to hand.
       */
      type: "DECK_DISCARD_TAKE_SPELL";
      count: number;
      trigger: "other-action" | "on-attack";
    }
  | {
      /**
       * Dungeon Minotaurs (Few/Pack): "If you resolve a '-1' on the Attack die,
       * draw a card." After this unit's attack resolves on `onRoll`, its
       * controller draws `amount` card(s). (The neutral Minotaur rerolls the
       * "-1" instead — a different printed card.)
       */
      type: "ON_ATTACK_DIE_DRAW";
      onRoll?: number;
      minRoll?: number;
      maxRoll?: number;
      amount: number;
    }
  | {
      /**
       * Tower Magi (Pack): "[activation] Add +N power to the first spell you
       * cast this round." When this unit activates, its controller's first
       * Spell cast in the current combat round gains `amount` power; unused, it
       * lapses at the end of the combat round.
       *
       * Conflux Pack Elementals (Storm/Ice/Energy/Magma): the same bonus, but
       * scoped to a single Spell `school` — "Add +N power to the first <school>
       * Magic spell you cast during this Activation." When `school` is set the
       * bonus only lands on a Spell whose school list includes it; when it is
       * omitted (the Magi) the bonus lands on the first Spell of any school.
       */
      type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST";
      amount: number;
      school?: SpellSchool;
    }
  | {
      /**
       * Creature Bank Dragon Utopia Black Dragons: "As long as this unit is
       * Stacked, its Attack gains +N." A flat, unclamped innate Attack bonus on
       * every attack (and Retaliation Attack) the unit makes. Combined with the
       * ability's `requiresStacked` gate, it applies only while the bank card
       * still carries its Stack Token.
       */
      type: "FLAT_ATTACK_BONUS";
      amount: number;
      /** MGQ Wild Hair: the bonus is live only after this side has taken damage. */
      requiresDamaged?: boolean;
    }
  | {
      /**
       * WoG Lava Sharpshooter / War Zealot: "+N Attack when this unit attacks."
       * A flat, unclamped innate Attack bonus added to the unit's OWN attack
       * only — NOT its Retaliation Attack (the reducer gates it on
       * `!isRetaliation`). Distinct from `FLAT_ATTACK_BONUS`, which also raises
       * the Retaliation Attack.
       */
      type: "OWN_ATTACK_FLAT_BONUS";
      amount: number;
    }
  | {
      /** Veterancy hunter: Attack bonus against a strictly slower live target. */
      type: "ATTACK_BONUS_VS_SLOWER_TARGET";
      amount: number;
    }
  | {
      /**
       * Creature Bank Dwarven Treasury Dwarves and Dragon Utopia Crystal
       * Dragons: "As long as this unit is Stacked, it is treated as if it had a
       * Defense token on it." The unit rolls the Defend die when attacked (a
       * "+1" face grants +1 Defense), exactly like a real Defense token, without
       * spending an action. Paired with `requiresStacked` so it lasts only while
       * the card is Stacked.
       */
      type: "SELF_DEFENSE_TOKEN";
    }
  | {
      /** MGQ Emily: grant the controller positive Morale at combat setup. */
      type: "ON_COMBAT_START_GAIN_MORALE";
      amount: number;
    }
  | {
      /** Printed maximum-Health multiplier, folded when a combat side is built/rebuilt. */
      type: "MAX_HEALTH_MULTIPLIER";
      numerator: number;
      denominator: number;
    }
  | {
      /**
       * Creature Bank Medusa Stores Medusas: "If this unit is Stacked, the
       * target gains Paralysis." After this unit's own attack (never a
       * Retaliation Attack) an ADJACENT, still-living target gains a Paralysis
       * token — a ranged shot at a distant foe does NOT paralyze (the adjacency
       * gate lives in applyOnAttackParalysis). Paired with `requiresStacked` so
       * it only fires while the card is Stacked.
       */
      type: "PARALYZE_TARGET_ON_ATTACK";
    }
  | {
      /**
       * Creature Bank Crypt / Shipwreck Wraiths: "Whenever this unit attacks,
       * the enemy must discard N card(s) from hand (if possible)." Fires after
       * this unit's own attack (never a Retaliation Attack); a random card is
       * discarded from the defending player's hand, as many as `count` allows.
       */
      type: "ON_ATTACK_DISCARD_ENEMY_CARD";
      count: number;
    }
  | {
      /**
       * Creature Bank Dragon Utopia Faerie Dragons: "As long as this unit is
       * Stacked, the enemy cannot cast spells." While a living enemy unit with
       * this ability is on the board, the opposing player may not cast any Spell
       * (hand, Scroll or Helm). Paired with `requiresStacked` so the lock lasts
       * only while the Faerie Dragons keep their Stack Token.
       */
      type: "SPELL_CAST_LOCK";
    }
  | {
      /**
       * Fangarm: "[unit_passive] Ignore all [spell] and Specialty effects other
       * than [damage]." A unit with this ability:
       *   • is skipped by effectAppliesToUnit for any ongoing effect whose source
       *     is a spell OR hero-specialty card (blocks Bless, Slow, Berserk, …),
       *   • is immune to Paralysis placement from spells (Blind).
       * Damage from spells and specialties still resolves normally.
       */
      type: "IGNORE_SPELL_AND_SPECIALTY_NONDAMAGE";
    }
  | {
      /**
       * Factory Couatls: "[activation] Once per Combat. Until its next
       * activation, this unit ignores all [damage] and [spell] effects." At the
       * start of its activation the controller may switch on `invulnerable-
       * UntilActivation` (once per combat). The Few's activation of it ENDS the
       * turn (`endsActivation`); the Pack's card adds "does not replace any
       * regular actions", so it is free and the unit still moves and attacks.
       */
      type: "ON_ACTIVATION_INVULNERABILITY";
      /** Few: using it is the whole turn. Pack: false — it does not replace the action. */
      endsActivation: boolean;
    }
  | {
      /**
       * Factory Dreadnoughts (Juggernaut): "[activation] Instead of attacking,
       * select up to N units adjacent to this one. Allocate `damageValues`
       * [damage], starting with the first selected unit." A pure flat-damage
       * allocation offered as an alternative to attacking (so it never provokes a
       * retaliation): the player picks up to `damageValues.length` adjacent units
       * in order, and the k-th pick suffers `damageValues[k]`. Few: [1,1] (up to
       * 2 units); Pack/Neutral: [2,1,1] (up to 3 units).
       */
      type: "SPLASH_ALLOCATION_ATTACK";
      damageValues: number[];
    }
  | {
      /**
       * Factory Automaton (Few): "[activation] You may place a faction cube on
       * this unit (up to `maxCubes`)." At the start of its activation the
       * controller may add one faction cube (optional, does not end the turn),
       * capped at `maxCubes`. On removal the Automaton's cube-scaled Detonate
       * (ON_REMOVAL_DAMAGE_ADJACENT `perCube`) deals that many damage to each
       * neighbour.
       */
      type: "ON_ACTIVATION_PLACE_FACTION_CUBE";
      maxCubes: number;
    }
  | {
      /**
       * Factory Sandworms (Pack): "[unit_passive] Place a faction cube on this
       * unit whenever it defeats an enemy unit." Every time one of this unit's
       * attacks removes an enemy from the board it banks a faction cube (paired
       * with SPEND_FACTION_CUBE_ATTACK_AGAIN, which spends them).
       */
      type: "ON_KILL_GAIN_FACTION_CUBE";
    }
  | {
      /**
       * Factory Sandworms (Pack): "[activation] You may remove a faction cube
       * from this unit in order to attack again." After it has attacked, while it
       * still carries a faction cube the controller may spend one to make another
       * full attack (a fresh target choice); it can chain as long as cubes remain
       * (Olgoi-Khorkhoi "devouring corpses" for extra attacks).
       */
      type: "SPEND_FACTION_CUBE_ATTACK_AGAIN";
    }
  | {
      /**
       * Factory Bounty Hunters (Neutral guard) "Preemptive Shot": "[unit_passive]
       * Retaliate before an opponent's attack. This unit also retaliates against
       * non-adjacent units." When this unit is attacked it makes its Retaliation
       * Attack FIRST — before the attacker's blow lands, so a lethal counter can
       * cancel the incoming attack — and it retaliates against ranged
       * (non-adjacent) attackers too, not only adjacent ones. Still only once per
       * round (the pre-emptive strike spends its retaliation).
       */
      type: "PREEMPTIVE_RETALIATION";
    }
  | {
      /**
       * WOG commander command ability: once per combat round, free during the
       * commander's own activation, the owner casts the commander's signature
       * effect on a chosen target. The whole cast (targeting rules, Power
       * scaling, effect) is data-driven from src/data/commanders.ts keyed by
       * the unit's `commanderSlug`; resolution lives in the reducer's
       * "commander-cast" ABILITY_TARGET_CHOICE branch.
       */
      type: "COMMANDER_CAST";
    }
  | {
      /**
       * WOG commander Damage grade (Might): on each of the unit's attacks (and
       * retaliations) it rolls `dice` ADDITIONAL attack dice alongside its
       * normal attack die. Every extra "+1" face raises the attack value; at
       * most one "−1" face counts (extra "−1"s are ignored). Resolved before
       * the defense math in the attack pipeline (reducer.ts / getMightDiceCount).
       */
      type: "MIGHT_ATTACK_DICE";
      dice: number;
    }
  | {
      /**
       * WOG commander Charge combo (Damage+Speed at grade 3): +`amount` Attack
       * when the unit attacks after having moved this activation (never on a
       * retaliation).
       */
      type: "ATTACK_BONUS_AFTER_MOVE";
      amount: number;
    };

/**
 * Adventure-map ("global") abilities granted while the unit card sits in a
 * player's army. They never fire in combat — the engine reads them from the
 * army during the adventure round/turn structure.
 */
export type UnitMapAbilityEffect =
  | {
      /** Crystal Dragons: "At the beginning of each Resource round, gain N." */
      type: "MAP_RESOURCE_ROUND_GAIN";
      resource: "gold" | "buildingMaterials" | "valuables";
      amount: number;
    }
  | {
      /** Nomads: "At the end of your turn, move your Hero to an adjacent empty field." */
      type: "MAP_END_TURN_HERO_STEP";
    }
  | {
      /**
       * Rogues: "Once during your turn, look at the top card from any deck,
       * then put it back on the top or on the bottom of that deck."
       */
      type: "MAP_TURN_DECK_PEEK";
    }
  | {
      /**
       * Champions: "If your hero is on a field with Stables, this unit's
       * reinforcement cost is reduced by N gold." Applied to this unit's
       * Few→Pack reinforcement while a hero the player controls stands on a
       * field carrying `location`.
       */
      type: "MAP_REINFORCE_DISCOUNT";
      location: string;
      amount: number;
    }
  | {
      /**
       * Satyrs: "Once per turn. Roll an Attack die. On a '+1', gain
       * [morale_positive]." The die is rolled server-side from the game seed
       * and the result appended as an ADVENTURE_DICE_ROLLED event before morale
       * is updated. Gated by `player.satyrMoraleRollUsedThisTurn`.
       */
      type: "MAP_TURN_MORALE_ROLL";
    };

export type UnitAbilityDefinition = {
  id: string;
  name: string;
  text: string;
  effect?: UnitAbilityEffectDefinition;
  /** Adventure-map ability granted while the unit is in a player's army. */
  mapEffect?: UnitMapAbilityEffect;
  /**
   * "As long as this unit is Stacked …": Creature Bank cards whose effect only
   * applies while the card still carries its Stack Token. The engine's single
   * ability chokepoint (`getUnitAbilityDefinitions`) hides such an ability — for
   * every read, combat or display — whenever the unit is not Stacked, so the
   * effect (and only it) switches off the instant the token is discarded.
   */
  requiresStacked?: boolean;
  /**
   * Raid-boss phase gate (§6.5.2): the ability is active only while the unit
   * has at most this many health LAYERS remaining (layers = armyStacks + 1 —
   * a plain unlayered unit counts 1). `getUnitAbilityDefinitions` hides it for
   * every read while more layers remain, so e.g. Enrage switches on live the
   * moment the boss drops to its last bar. Absent = always active.
   */
  requiresLayersAtMost?: number;
  implementationStatus: "implemented" | "not-implemented";
};

export const unitAbilities: Record<string, UnitAbilityDefinition> = {
  "mgq-undine-heal-1": {
    id: "mgq-undine-heal-1", name: "Healing Water",
    text: "[activation] Before moving, heal another friendly unit for 1 Health.",
    effect: { type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF", healAmount: 1, attackBonus: 0 },
    implementationStatus: "implemented"
  },
  "mgq-undine-heal-2": {
    id: "mgq-undine-heal-2", name: "Greater Healing Water",
    text: "[activation] Before moving, heal another friendly unit for 2 Health.",
    effect: { type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF", healAmount: 2, attackBonus: 0 },
    implementationStatus: "implemented"
  },
  "mgq-sylph-speed-aura": {
    id: "mgq-sylph-speed-aura", name: "Wind's Blessing",
    text: "[unit_passive] All your other troops gain +1 Initiative.",
    implementationStatus: "implemented"
  },
  "doom-demon-retaliation-attack": {
    id: "doom-demon-retaliation-attack",
    name: "Savage Retaliation",
    text: "[unit_retaliation] This unit gains +1 Attack when retaliating.",
    effect: { type: "RETALIATION_ATTACK_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "doom-arachnotron-triple-strike": {
    id: "doom-arachnotron-triple-strike",
    name: "Triple Plasma",
    text: "[unit_attack] Attack the same target three times with Attack 3, then Attack 2, then Attack 1.",
    effect: { type: "SEQUENCE_ATTACK_SAME_TARGET", followUpAttacks: [2, 1] },
    implementationStatus: "implemented"
  },
  "doom-cacodemon-poison": {
    id: "doom-cacodemon-poison",
    name: "Burning Poison",
    text: '[unit_attack] On a "-1" or "0" Attack die, place 1 poison cube on the target; it deals 1 damage at activation.',
    effect: { type: "ON_ATTACK_DIE_POISON_CUBES", minRoll: -1, maxRoll: 0, count: 1 },
    implementationStatus: "implemented"
  },
  "doom-baron-damage-cap": {
    id: "doom-baron-damage-cap",
    name: "Hellborn Hide",
    text: "[unit_passive] This unit cannot take more than 4 damage from a single attack.",
    effect: { type: "CAP_DAMAGE_PER_ATTACK", amount: 4 },
    implementationStatus: "implemented"
  },
  "doom-former-human-sergeant-double-roll": {
    id: "doom-former-human-sergeant-double-roll",
    name: "Shotgun Assault",
    // [unit_passive] wording (the Crusaders convention): `retaliationAlso`
    // makes the two-dice roll fire on Retaliation Attacks too, so an
    // own-attack-only [unit_attack] icon would misstate what runs.
    text: "[unit_passive] During any attack — own attacks and Retaliation Attacks alike — roll 2 Attack dice and resolve both results.",
    effect: { type: "ROLL_TWO_DICE_APPLY_BOTH", retaliationAlso: true },
    implementationStatus: "implemented"
  },
  "doom-mancubus-retaliation-advantage": {
    id: "doom-mancubus-retaliation-advantage",
    name: "Retaliation Volley",
    text: "[unit_retaliation] Roll 2 Attack dice and resolve the higher outcome.",
    effect: { type: "ATTACK_ROLL_ADVANTAGE", retaliationOnly: true },
    implementationStatus: "implemented"
  },
  "doom-pain-elemental-summon-lost-soul": {
    id: "doom-pain-elemental-summon-lost-soul",
    name: "Lost Soul Burst",
    text: "[unit_attack] After an attack, randomly summon a Lost Soul onto an empty battlefield space.",
    effect: { type: "SUMMON_UNIT_ON_ATTACK", unitDefId: "doom.lost_soul" },
    implementationStatus: "implemented"
  },
  "doom-revenant-pre-attack-damage": {
    id: "doom-revenant-pre-attack-damage",
    name: "Death Mark",
    text: "[activation] Deal 1 damage to the target this unit is going to attack.",
    effect: { type: "ON_ATTACK_PRE_DAMAGE", amount: 1 },
    implementationStatus: "implemented"
  },
  "doom-spider-mastermind-adjacent-strike": {
    id: "doom-spider-mastermind-adjacent-strike",
    name: "Mastermind Assault",
    text: '[unit_attack] If the Attack die is "-1", also attack another unit adjacent to the target.',
    effect: { type: "SECOND_ATTACK_ADJACENT_TO_TARGET", baseAttack: 7, onRoll: -1 },
    implementationStatus: "implemented"
  },
  "unlimited-retaliation": {
    id: "unlimited-retaliation",
    name: "Unlimited Retaliation",
    text: "May retaliate more than once in a combat round.",
    effect: { type: "ALLOW_UNLIMITED_RETALIATION" },
    implementationStatus: "implemented"
  },
  "ignore-combat-penalties": {
    id: "ignore-combat-penalties",
    name: "No Adjacent Penalty",
    text: "Ignores the combat penalty for attacking an adjacent unit. The long-range / behind-wall penalty still applies.",
    effect: { type: "IGNORE_RANGED_MELEE_PENALTY" },
    implementationStatus: "implemented"
  },
  "ignore-all-combat-penalties": {
    id: "ignore-all-combat-penalties",
    name: "No Combat Penalties",
    text: "Ignores all ranged combat penalties — both attacking an adjacent unit and the long-range / behind-wall shot.",
    effect: { type: "IGNORE_RANGED_PENALTIES" },
    implementationStatus: "implemented"
  },
  "ranged-extra-shot-on-low-roll": {
    id: "ranged-extra-shot-on-low-roll",
    name: "Low Roll Extra Shot",
    text: "After a ranged attack roll of 0 or lower, deals 1 extra attack damage to the defender.",
    effect: { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL", maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "double-attack": {
    id: "double-attack",
    name: "Double Attack",
    text: "If the target is a non-adjacent unit, attack this target again (once — the second attack never triggers a third).",
    effect: { type: "DOUBLE_ATTACK" },
    implementationStatus: "implemented"
  },
  "double-attack-low-roll": {
    id: "double-attack-low-roll",
    name: "Double Attack (−1/0)",
    text: "If the target is a non-adjacent unit and the die shows −1 or 0, attack this target again (stops after the second attack).",
    effect: { type: "DOUBLE_ATTACK", maxRoll: 0 },
    implementationStatus: "implemented"
  },
  "ignores-retaliation": {
    id: "ignores-retaliation",
    name: "No Retaliation",
    text: "Attacks by this unit never provoke a Retaliation Attack.",
    effect: { type: "IGNORE_RETALIATION" },
    implementationStatus: "implemented"
  },
  // Factory Automaton (board game): detonates when it leaves the board, dealing
  // 2 damage to every adjacent unit — friend and foe. The Few and Pack carry the
  // same id; Frederick's specialty raises the amount via the controller bonus.
  "automaton-detonate": {
    id: "automaton-detonate",
    name: "Detonate",
    text: "[unit_passive] When this unit would be removed from Combat, deal 2 damage to each adjacent unit (friend and foe).",
    effect: { type: "ON_REMOVAL_DAMAGE_ADJACENT", amount: 2 },
    implementationStatus: "implemented"
  },
  // Factory Automaton — NEUTRAL guard version (single-cost card): the weaker
  // 1-damage Detonate. Reuses the same wired ON_REMOVAL_DAMAGE_ADJACENT effect,
  // so it fizzles/scales exactly like the faction Detonate but at amount 1.
  "automaton-detonate-1": {
    id: "automaton-detonate-1",
    name: "Detonate",
    text: "[unit_passive] When this unit is defeated, deal 1 damage to each adjacent unit.",
    effect: { type: "ON_REMOVAL_DAMAGE_ADJACENT", amount: 1 },
    implementationStatus: "implemented"
  },
  // Factory Armadillo (board game): "Curled" — +2 Defense while it is defending
  // (holds a Defense token). Reuses the Mammoth Thick-Hide DEFEND_BONUS path.
  // NOTE: the physical Armadillo card carries NO Curl text — this entry is a
  // leftover from the fabricated PC-guess placeholder and is on NO shipping unit
  // (factory-content.test asserts no side carries it). Kept only so the removal
  // stays a conscious, reviewable decision.
  "armadillo-curl": {
    id: "armadillo-curl",
    name: "Curled",
    text: "[unit_passive] While defending, this unit has +2 Defense.",
    effect: { type: "DEFEND_BONUS", amount: 2 },
    implementationStatus: "implemented"
  },
  // ---- Factory (board game) unit abilities read straight off the card scans ---
  // Factory Mechanics: "[activation] Remove up to N [damage] from an adjacent
  // [mechanical] unit" (the Few also, the Pack "…, or gain +1 [attack]"). Reuses
  // the Enchanters' heal-or-buff activation, gated to ADJACENT + mechanical
  // targets (Automatons / Dreadnoughts). The Few has NO self-buff alternative
  // (attackBonus 0) — with nothing to repair its repair simply does nothing; the
  // Pack falls back to +1 Attack. Neither ends the activation, so the Mechanic
  // still moves and makes its line attack afterwards.
  "mechanics-repair-1": {
    id: "mechanics-repair-1",
    name: "Field Repair",
    text: "[activation] Remove up to 1 damage from an adjacent mechanical unit (Automatons or Dreadnoughts). Does not end the activation.",
    effect: {
      type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF",
      healAmount: 1,
      attackBonus: 0,
      adjacentOnly: true,
      targetTrait: "mechanical"
    },
    implementationStatus: "implemented"
  },
  "mechanics-repair-2": {
    id: "mechanics-repair-2",
    name: "Field Repair",
    text: "[activation] Remove up to 2 damage from an adjacent mechanical unit (Automatons or Dreadnoughts), or gain +1 Attack for the round if none can be repaired. Does not end the activation.",
    effect: {
      type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF",
      healAmount: 2,
      attackBonus: 1,
      adjacentOnly: true,
      targetTrait: "mechanical"
    },
    implementationStatus: "implemented"
  },
  // Factory Mechanics: "[activation] Attack 2 spaces in a line. The first attack
  // resolves normally, and the second has N [attack]." Mechanically identical to
  // the Gold Dragons' line attack (SECOND_ATTACK_BEHIND_TARGET): after the melee
  // attack a full separate attack at the printed replacement value strikes the
  // unit directly behind the target (friend or foe; never adjacent → never
  // retaliates, never chains). Few/Neutral hit at attack 1, the Pack at attack 2.
  "mechanics-line-attack-1": {
    id: "mechanics-line-attack-1",
    name: "Piston Reach",
    text: "[activation] Attack 2 spaces in a line: after the attack, a full separate attack at attack 1 strikes the unit directly behind the target (friend or foe). That unit is not adjacent, so it never retaliates.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 1 },
    implementationStatus: "implemented"
  },
  "mechanics-line-attack-2": {
    id: "mechanics-line-attack-2",
    name: "Piston Reach",
    text: "[activation] Attack 2 spaces in a line: after the attack, a full separate attack at attack 2 strikes the unit directly behind the target (friend or foe). That unit is not adjacent, so it never retaliates.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 2 },
    implementationStatus: "implemented"
  },
  "mgq-jessie-spear-wall": {
    id: "mgq-jessie-spear-wall",
    name: "Spear Wall",
    text: "[unit_attack] After this unit's normal attack, deal 2 damage to the unit directly behind the target. This damage ignores Defense and never provokes Retaliation.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 2, fixedDamage: true },
    implementationStatus: "implemented"
  },
  // Factory Halflings (Pack): "Roll 2 Attack dice and resolve the higher one. If
  // you resolve a +1 on the Attack Die, the attacked unit suffers -1 [defense]
  // (to a minimum of 0)." The roll-two-take-higher half is attack-roll-advantage;
  // this companion places a Corrosion token on the target when the resolved die
  // is "+1". A Corrosion token only ever LOWERS Defense (min 0) — the same wired
  // ON_ATTACK_DIE_TOKEN the Rust Dragons use, but on the "+1" face for -1 Defense.
  "halfling-precise-shot": {
    id: "halfling-precise-shot",
    name: "Precise Shot",
    text: 'On a "+1" on the Attack die, place a Corrosion token on the target: -1 Defense (to a minimum of 0) for the rest of the combat.',
    effect: { type: "ON_ATTACK_DIE_TOKEN", onRoll: 1, token: "corrosion", amount: 1 },
    implementationStatus: "implemented"
  },
  // WoG Lava Sharpshooter and War Zealot: "When this unit attacks, it gains +1
  // Attack." A flat innate bonus on the unit's OWN attack only (never its
  // Retaliation Attack). Wired via OWN_ATTACK_FLAT_BONUS + getOwnAttackFlatBonus,
  // gated on `!isRetaliation` in the reducer; covered by wog-abilities.test.ts.
  "wog-attack-when-attacking-1": {
    id: "wog-attack-when-attacking-1",
    name: "Battle Fury",
    text: "[unit_attack] When this unit attacks, it gains +1 Attack.",
    effect: { type: "OWN_ATTACK_FLAT_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  // Factory Bounty Hunters (Few/Pack): "At the start of Combat, place a Mark
  // token on an enemy unit. Bounty Hunters gain +N [attack] against Marked units."
  // The Mark is auto-placed on the strongest enemy at combat start; any Bounty
  // Hunter attacking a Marked unit adds its bonus (Few +1, Pack +2).
  "bounty-hunter-mark-1": {
    id: "bounty-hunter-mark-1",
    name: "Mark",
    text: "[unit_passive] At the start of Combat, place a Mark token on an enemy unit. This unit gains +1 Attack against Marked units.",
    effect: { type: "MARK_AND_HUNT", attackBonus: 1 },
    implementationStatus: "implemented"
  },
  "bounty-hunter-mark-2": {
    id: "bounty-hunter-mark-2",
    name: "Mark",
    text: "[unit_passive] At the start of Combat, place a Mark token on an enemy unit. This unit gains +2 Attack against Marked units.",
    effect: { type: "MARK_AND_HUNT", attackBonus: 2 },
    implementationStatus: "implemented"
  },
  // Factory Armadillos (Pack): "Whenever this unit's [initiative] is increased by
  // an effect, increase it by an additional 1." A positive Initiative shift from
  // any active effect (Haste, a hero specialty, Necklace of Swiftness…) is
  // amplified by +1 in effectiveInitiative. The Few and Neutral guard have no
  // ability, so this rides the Pack alone.
  "armadillo-initiative-amplify": {
    id: "armadillo-initiative-amplify",
    name: "Gathering Momentum",
    text: "[unit_passive] Whenever this unit's Initiative is increased by an effect, increase it by an additional 1.",
    effect: { type: "AMPLIFY_INITIATIVE_INCREASE" },
    implementationStatus: "implemented"
  },
  // Factory Sandworms (Neutral guard): "If a target is an adjacent unit, attack
  // this target again." Sandworms are flying melee (printed wing icon) and only
  // ever attack adjacent targets, so this is a same-target second strike — the
  // wired SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION (Wolf Raiders): after the
  // target retaliates (if it still can) the Sandworm strikes it once more, and
  // that follow-up never provokes another retaliation.
  "sandworm-strike-again": {
    id: "sandworm-strike-again",
    name: "Relentless Burrow",
    text: "After the adjacent target retaliates, if possible, attack that target again. The second attack does not provoke another retaliation.",
    effect: { type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION" },
    implementationStatus: "implemented"
  },
  // Factory Automaton (Few): the cube subsystem. "[activation] You may place a
  // faction cube on this unit (up to 2)" banks cubes; on removal the Detonate
  // deals that many damage to each neighbour (perCube, so 0 cubes = no blast).
  "automaton-place-cube": {
    id: "automaton-place-cube",
    name: "Overcharge",
    text: "[activation] You may place a faction cube on this unit (up to 2). Does not end the activation.",
    effect: { type: "ON_ACTIVATION_PLACE_FACTION_CUBE", maxCubes: 2 },
    implementationStatus: "implemented"
  },
  "automaton-detonate-cubes": {
    id: "automaton-detonate-cubes",
    name: "Detonate",
    text: "[unit_passive] When this unit is defeated, remove its faction cubes to inflict that many damage to each adjacent unit (friend and foe).",
    effect: { type: "ON_REMOVAL_DAMAGE_ADJACENT", amount: 0, perCube: true },
    implementationStatus: "implemented"
  },
  // Factory Sandworms (Pack): the cube subsystem's other half. Banks a cube on
  // every kill and spends one to attack again (chains while cubes remain).
  "sandworm-cube-gain": {
    id: "sandworm-cube-gain",
    name: "Devour",
    text: "[unit_passive] Place a faction cube on this unit whenever it defeats an enemy unit.",
    effect: { type: "ON_KILL_GAIN_FACTION_CUBE" },
    implementationStatus: "implemented"
  },
  "sandworm-cube-attack": {
    id: "sandworm-cube-attack",
    name: "Feeding Frenzy",
    text: "[activation] You may remove a faction cube from this unit in order to attack again.",
    effect: { type: "SPEND_FACTION_CUBE_ATTACK_AGAIN" },
    implementationStatus: "implemented"
  },
  // Factory Couatls (Few/Pack): the activated invulnerability. The Few version
  // ends the turn when used; the Pack version is free ("does not replace any
  // regular actions"). Both grant "ignore all damage & spell effects until this
  // unit's next activation", once per combat.
  "couatl-invulnerability-few": {
    id: "couatl-invulnerability-few",
    name: "Ethereal Coil",
    text: "[activation] Once per Combat. Until its next activation, this unit ignores all damage and spell effects. Using it is this unit's action for the turn.",
    effect: { type: "ON_ACTIVATION_INVULNERABILITY", endsActivation: true },
    implementationStatus: "implemented"
  },
  "couatl-invulnerability-pack": {
    id: "couatl-invulnerability-pack",
    name: "Ethereal Coil",
    text: "[activation] Once per Combat. Until its next activation, this unit ignores all damage and spell effects. Does not replace any regular actions.",
    effect: { type: "ON_ACTIVATION_INVULNERABILITY", endsActivation: false },
    implementationStatus: "implemented"
  },
  // Factory Dreadnoughts (Juggernaut): "[activation] Instead of attacking, select
  // up to N units adjacent to this one. Allocate the printed damage, starting
  // with the first selected unit." Few hits up to 2 for 1/1; Pack/Neutral up to
  // 3 for 2/1/1. A flat allocation (no attack roll, no retaliation).
  "dreadnought-splash-1": {
    id: "dreadnought-splash-1",
    name: "Concussive Slam",
    text: "[activation] Instead of attacking, select up to 2 units adjacent to this one. Allocate 1/1 damage, starting with the first selected unit.",
    effect: { type: "SPLASH_ALLOCATION_ATTACK", damageValues: [1, 1] },
    implementationStatus: "implemented"
  },
  "dreadnought-splash-2": {
    id: "dreadnought-splash-2",
    name: "Concussive Slam",
    text: "[activation] Instead of attacking, select up to 3 units adjacent to this one. Allocate 2/1/1 damage, starting with the first selected unit.",
    effect: { type: "SPLASH_ALLOCATION_ATTACK", damageValues: [2, 1, 1] },
    implementationStatus: "implemented"
  },
  // Factory Bounty Hunters (Neutral guard): "Preemptive Shot" — retaliate before
  // the attacker's blow lands, and against non-adjacent (ranged) attackers too.
  "bounty-hunter-preemptive": {
    id: "bounty-hunter-preemptive",
    name: "Preemptive Shot",
    text: "[unit_passive] Retaliate before an opponent's attack. This unit also retaliates against non-adjacent units.",
    effect: { type: "PREEMPTIVE_RETALIATION" },
    implementationStatus: "implemented"
  },
  "teleport-move": {
    id: "teleport-move",
    name: "Teleport",
    text: "As a regular movement, this unit can move to any empty space.",
    effect: { type: "MOVE_ANYWHERE" },
    implementationStatus: "implemented"
  },
  // --- Bulwark faction abilities (heroes.thelazy.net/Bulwark, rescaled) ---
  "bulwark-kobold-gold": {
    id: "bulwark-kobold-gold",
    name: "Gold Generation",
    text: "[map] At the beginning of each Resource round, this unit's controller gains 1 gold.",
    mapEffect: { type: "MAP_RESOURCE_ROUND_GAIN", resource: "gold", amount: 1 },
    implementationStatus: "implemented"
  },
  "bulwark-yeti-recover": {
    id: "bulwark-yeti-recover",
    name: "Recovery",
    text: "[unit_passive] At the start of its activation, this unit recovers from all negative effects (negative ongoing effects and Weakness/Corrosion tokens).",
    effect: { type: "CLEAR_OWN_DEBUFFS_ON_ACTIVATION" },
    implementationStatus: "implemented"
  },
  "bulwark-air-shield": {
    id: "bulwark-air-shield",
    name: "Air Shield",
    text: "[unit_passive] +1 Defense against attacks from ranged units.",
    effect: { type: "DEFENSE_VS_ATTACKER_TYPE", attackerType: "ranged", amount: 1 },
    implementationStatus: "implemented"
  },
  "bulwark-freezing-shot": {
    id: "bulwark-freezing-shot",
    name: "Freezing Shot",
    text: "[unit_attack] After the attack, reduce the target's Initiative by 2 through its next combat round.",
    effect: { type: "ON_ATTACK_INITIATIVE_DEBUFF", amount: -2 },
    implementationStatus: "implemented"
  },
  "bulwark-thick-hide": {
    id: "bulwark-thick-hide",
    name: "Thick Hide",
    text: "[unit_passive] +1 Defense while this unit is defending.",
    effect: { type: "DEFEND_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "bulwark-jotunn-teleport": {
    id: "bulwark-jotunn-teleport",
    name: "Teleport",
    text: "[activation] At the start of its activation this unit may teleport one of your other units (a friendly unit, never itself or an enemy) to an empty space — optional, and it still acts as normal afterwards.",
    effect: { type: "TELEPORT_ANY_AT_ACTIVATION" },
    implementationStatus: "implemented"
  },
  "magog-fireball-splash": {
    id: "magog-fireball-splash",
    name: "Fireball Splash",
    text: "When this unit attacks a target that is not adjacent to it, it also deals 1 damage to a unit adjacent to the target (the attacker chooses; a lone friendly unit takes the hit).",
    effect: { type: "FLAT_DAMAGE_ADJACENT_TO_TARGET", amount: 1, requiresNonAdjacentTarget: true },
    implementationStatus: "implemented"
  },
  "cerberi-second-head": {
    id: "cerberi-second-head",
    name: "Multi-Headed Bite",
    text: "Additionally deals 1 damage to another enemy unit adjacent to this unit (the attacker chooses).",
    effect: { type: "FLAT_DAMAGE_ADJACENT_TO_SELF", amount: 1 },
    implementationStatus: "implemented"
  },
  // No shipping unit carries this any more (the printed Cerberi use
  // `cerberi-second-head`). It is intentionally retained as the engine's
  // generic "attack every adjacent enemy" multi-attack-queue capability and is
  // exercised by ruleset.test.ts — do not delete without removing that test.
  "cerberi-attack-all": {
    id: "cerberi-attack-all",
    name: "Three-Headed Assault",
    text: "BINH: after its attack, this unit performs a full separate attack (attack 3) against every other enemy unit adjacent to it. Each follow-up can be answered with instants and defense; none retaliates.",
    effect: { type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF", baseAttack: 3 },
    implementationStatus: "implemented"
  },
  // Conflux Magic Elementals (Few): "Attack all adjacent units." After its
  // primary attack it makes a full separate attack — at its OWN (buffable)
  // attack — against every other adjacent unit, FRIEND OR FOE. None retaliates.
  "magic-elemental-attack-all": {
    id: "magic-elemental-attack-all",
    name: "Attack All Adjacent",
    text: "[unit_attack] After its attack, this unit makes a full separate attack against every other unit adjacent to it — friend or foe. None of these follow-ups retaliates or chains.",
    effect: { type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF", includeAllies: true },
    implementationStatus: "implemented"
  },
  // Conflux Magic Elementals (Pack): "Attack all adjacent enemy units." Same
  // multi-attack at its OWN (buffable) attack, but enemies only.
  "magic-elemental-attack-all-enemies": {
    id: "magic-elemental-attack-all-enemies",
    name: "Attack All Adjacent Enemies",
    text: "[unit_attack] After its attack, this unit makes a full separate attack against every other enemy unit adjacent to it. None of these follow-ups retaliates or chains.",
    effect: { type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF" },
    implementationStatus: "implemented"
  },
  // Hidden Leaf Jinchuriki (Few) "Chakra Burst" — the town's one new engine arm,
  // shipped a step AHEAD of the faction, so no unit references it yet (like the
  // retained `cerberi-attack-all` and the commander/bank-only arms). Wired in
  // reducer.ts (applyAfterAttackSplash, called from finishResolvedAttack on the
  // primary declared attack) and pinned in after-attack-splash.test.ts.
  "jinchuriki-chakra-burst": {
    id: "jinchuriki-chakra-burst",
    name: "Chakra Burst",
    text: "[unit_attack] After an attack made by this unit resolves, deal 1 damage to every other unit adjacent to this unit — friend AND foe. This damage is not an attack: no Retaliation, not reduced by Defense, not subject to per-attack damage caps. Does not fire on a Retaliation Attack.",
    effect: { type: "AFTER_ATTACK_SPLASH", amount: 1 },
    implementationStatus: "implemented"
  },
  // Azur Lane Naval Base — the town's two bespoke engine arms (2026-07 upgrade).
  // "Full Barrage": the AFTER_ATTACK_SPLASH machinery anchored on the attack's
  // TARGET, enemies only — a gun-line salvo that rakes the struck ship's escorts.
  // Printed on Honolulu's Pack side and offered as a kansen veterancy signature;
  // wired in reducer.ts (applyAfterAttackSplash, around:"target" branch) and
  // pinned in kansen-abilities.test.ts (with the Chakra Burst as the
  // around-self / friendly-fire CONTROL).
  "kansen-full-barrage": {
    id: "kansen-full-barrage",
    name: "Full Barrage",
    text: "[unit_attack] After an attack made by this unit resolves, deal 1 damage to every other ENEMY unit adjacent to the attacked unit (the target itself takes only the attack). This damage is not an attack: no Retaliation, not reduced by Defense, not subject to per-attack damage caps. Does not fire on a Retaliation Attack.",
    effect: { type: "AFTER_ATTACK_SPLASH", amount: 1, around: "target", enemiesOnly: true },
    implementationStatus: "implemented"
  },
  // "Fleet Formation": a positional escort aura — friendly units attacking while
  // adjacent to the carrier strike harder. Live position read at resolution
  // (never on a Retaliation Attack); the carrier itself gains nothing. Wired in
  // reducer.ts (getFleetFormationAuraBonus inside getAttackStackDetails) and
  // pinned in kansen-abilities.test.ts.
  "kansen-best-friends": {
    id: "kansen-best-friends",
    name: "Best Friends",
    text: "[unit_passive] This unit gains +1 Attack while a friendly Laffey is in the battlefield.",
    effect: { type: "ALLY_NAME_ATTACK_BONUS", allyName: "Laffey", amount: 1 },
    implementationStatus: "implemented"
  },
  "yukikaze-torpedo-run": {
    id: "yukikaze-torpedo-run",
    name: "Torpedo Run",
    // "[unit_attack]" — once per attack, like the Minotaur/Crusader rerolls.
    text: '[unit_attack] May reroll a "-1" result on this unit\'s Attack die (once per attack).',
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, onlyOnRoll: -1 },
    implementationStatus: "implemented"
  },
  "i19-oxygen-torpedo-spread": {
    id: "i19-oxygen-torpedo-spread",
    name: "Oxygen Torpedo Spread",
    text: "[unit_attack] After the target retaliates, if possible, attack that same target again with Attack 4. The second attack does not provoke another retaliation.",
    effect: { type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION", baseAttack: 4 },
    implementationStatus: "implemented"
  },
  "kansen-fleet-formation": {
    id: "kansen-fleet-formation",
    name: "Fleet Formation",
    text: "[unit_passive] Friendly units gain +1 Attack on their own attacks (never on a Retaliation Attack) while they are adjacent to this unit.",
    effect: { type: "ADJACENT_ALLY_ATTACK_AURA", amount: 1 },
    implementationStatus: "implemented"
  },
  // Heavenly Demon Palace — the town's TWO new engine arms (shipped with the
  // faction; both are referenced by its units below). Wired + mutation-tested in
  // src/engine/heavenly-demon-abilities.test.ts.
  //
  // (1) Blood Siphon: heal 1 after this unit's OWN attack that DEALS damage —
  // distinct from the Vampire's unconditional ON_ATTACK_HEAL_SELF (a soaked
  // 0-damage attack heals nothing here). Never on a Retaliation Attack.
  "heavenly-demon-blood-siphon": {
    id: "heavenly-demon-blood-siphon",
    name: "Blood Siphon",
    text: "[unit_attack] After this unit's attack DEALS damage, remove 1 damage from it (an attack fully soaked to 0 heals nothing). Never on a Retaliation Attack.",
    effect: { type: "HEAL_SELF_ON_DAMAGE_DEALT", amount: 1 },
    implementationStatus: "implemented"
  },
  // (2) Reap the Fallen: whenever an ADJACENT unit is removed (any source), this
  // unit gains +1 Attack for the rest of the combat — escalating, and surviving a
  // Pack→Few flip (baked onto the combat unit's permanentAttackBonus, never
  // mirrored to the army card).
  "heavenly-demon-reap": {
    id: "heavenly-demon-reap",
    name: "Reap the Fallen",
    text: "[unit_passive] Whenever a unit adjacent to this unit is removed from Combat (any source), this unit gains +1 Attack for the rest of the Combat (this stacks with each nearby death).",
    effect: { type: "ATTACK_BUFF_ON_ADJACENT_REMOVAL", amount: 1 },
    implementationStatus: "implemented"
  },
  "lich-death-cloud": {
    id: "lich-death-cloud",
    name: "Death Cloud",
    text: "Choose a unit adjacent to the target and attack it. For the purpose of this attack, your attack is 2. (A full separate attack: instants may be played and the attack die rolls. It can — and with no other choice must — hit friendly units or the Liches themselves.)",
    effect: { type: "SECOND_ATTACK_ADJACENT_TO_TARGET", baseAttack: 2 },
    implementationStatus: "implemented"
  },
  "wolf-raiders-strike-twice": {
    id: "wolf-raiders-strike-twice",
    name: "Strike Twice",
    text: "After the target retaliates, if possible, attack that target again. The second attack does not provoke another retaliation.",
    effect: { type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION" },
    implementationStatus: "implemented"
  },
  "thunderbirds-lightning": {
    id: "thunderbirds-lightning",
    name: "Lightning Strike",
    text: 'Right after this unit attacks and before retaliation, roll 1 Attack die. On "0" or "+1", deal 1 damage to the target.',
    effect: { type: "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET", minRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "behemoth-defense-crush-few": {
    id: "behemoth-defense-crush-few",
    name: "Crushing Blow",
    text: "Decrease the target's defense by 1, to a minimum of 0, for this attack.",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK", amount: 1 },
    implementationStatus: "implemented"
  },
  "behemoth-defense-crush-pack": {
    id: "behemoth-defense-crush-pack",
    name: "Corrosive Crush",
    text: "Decrease the target's defense by 2, to a minimum of 0, for this attack. (The Corrosion token is placed by the companion ability.)",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK", amount: 2 },
    implementationStatus: "implemented"
  },
  "ogres-attack-token-pack": {
    id: "ogres-attack-token-pack",
    name: "Bloodlust Token",
    text: "Other action: place a '+2' Attack token on a chosen friendly ground or flying unit for 2 combat rounds. (A unit holds at most one Attack token — the better one is kept.)",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "attack",
      amount: 2,
      targets: "friendly",
      targetTypes: ["ground", "flying"],
      rounds: 2
    },
    implementationStatus: "implemented"
  },
  "ogres-attack-token-few": {
    id: "ogres-attack-token-few",
    name: "Bloodlust Token",
    text: "Other action: place a '+1' Attack token on a chosen friendly ground or flying unit for 2 combat rounds. (A unit holds at most one Attack token — the better one is kept.)",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "attack",
      amount: 1,
      targets: "friendly",
      targetTypes: ["ground", "flying"],
      rounds: 2
    },
    implementationStatus: "implemented"
  },
  "sorceress-weakness-few": {
    id: "sorceress-weakness-few",
    name: "Weakness Token",
    // engine: the Weakness token is a pure DEBUFF, so the engine only lets the
    // Sorceresses drop it on an ENEMY unit (targets: "enemy"). The verbatim wiki
    // card reads "on any one unit"; restricting it to enemies is a deliberate
    // house rule (a Weakness token on your own unit is never useful) and matches
    // the Ogres' mirror ability, which only buffs allies.
    text: "Other action: place a '−2' Weakness token on a chosen enemy unit for 2 combat rounds. (A unit holds at most one Weakness token.)",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "weakness",
      amount: -2,
      targets: "enemy",
      rounds: 2
    },
    implementationStatus: "implemented"
  },
  "sorceress-weakness-on-attack": {
    id: "sorceress-weakness-on-attack",
    name: "Weakness Token",
    text: "After the attack, place a '−1' Weakness token on the target for 2 combat rounds.",
    effect: { type: "ON_ATTACK_TOKEN", token: "weakness", amount: -1, rounds: 2 },
    implementationStatus: "implemented"
  },
  "behemoth-corrosion": {
    id: "behemoth-corrosion",
    name: "Corrosion Token",
    text: "After the attack, place 1 Corrosion token on the target (−1 defense, minimum 0, until the end of combat; one Corrosion token per unit).",
    effect: { type: "ON_ATTACK_TOKEN", token: "corrosion", amount: -1 },
    implementationStatus: "implemented"
  },
  "cyclops-demolish": {
    id: "cyclops-demolish",
    name: "Siege Breaker",
    text: "Other action: this unit can destroy the Gate or a Wall (at any range, automatically successful).",
    effect: { type: "DEMOLISH_FORTIFICATION", canTargetArrowTower: false },
    implementationStatus: "implemented"
  },
  "cyclops-demolish-full": {
    id: "cyclops-demolish-full",
    name: "Siege Breaker",
    text: "Other action: this unit can destroy the Gate, a Wall, or the Arrow Tower (at any range, automatically successful).",
    effect: { type: "DEMOLISH_FORTIFICATION", canTargetArrowTower: true },
    implementationStatus: "implemented"
  },
  "siege-arrow-tower": {
    id: "siege-arrow-tower",
    name: "Arrow Tower",
    text: "Fights from beside the board: shoots like a ranged unit with no positioning penalties, can only be hit by ranged attacks and card effects, and collapses instantly when all Walls and the Gate are destroyed.",
    implementationStatus: "implemented"
  },
  "attack-die-reroll": {
    id: "attack-die-reroll",
    name: "Attack Reroll",
    text: 'May reroll a "0" on its Attack die — the new result replaces the old one. Once per attack ([unit_attack]). Stacks with Luck and other rerolls; Luck is always spent last.',
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, onlyOnRoll: 0 },
    implementationStatus: "implemented"
  },
  // "[unit_attack] Roll 2 Attack dice and resolve the higher one." (neutral &
  // Factory Halflings, neutral Leprechaun). The [unit_attack] icon fires ONLY on
  // the unit's OWN declared attack, so `ownAttackOnly` drops the advantage on a
  // Retaliation Attack — matching the same [unit_attack] convention the
  // IGNORE_RANGED_PENALTIES waivers follow.
  "attack-roll-advantage": {
    id: "attack-roll-advantage",
    name: "Twin Attack Dice",
    text: "On this unit's own attack, roll 2 Attack dice and resolve the higher outcome (not on a Retaliation Attack).",
    effect: { type: "ATTACK_ROLL_ADVANTAGE", ownAttackOnly: true },
    implementationStatus: "implemented"
  },
  // "[unit_passive] During any attack, roll 2 Attack dice and resolve the higher
  // outcome." (neutral Crusaders). The [unit_passive] "any attack" wording
  // includes Retaliation Attacks, so this variant carries NO ownAttackOnly gate.
  "attack-roll-advantage-passive": {
    id: "attack-roll-advantage-passive",
    name: "Twin Attack Dice",
    text: "During any attack, roll 2 Attack dice and resolve the higher outcome.",
    effect: { type: "ATTACK_ROLL_ADVANTAGE" },
    implementationStatus: "implemented"
  },
  "magi-power-drain": {
    id: "magi-power-drain",
    name: "Power Drain",
    text: "After this unit's attack, the defending player either discards a card of their choice that can contribute Power (a Power statistic, any Spell, or a Power-granting Artifact/Ability) or lets a random card be discarded from their hand. With no Power card in hand, the random discard is forced.",
    effect: { type: "ENEMY_DISCARDS_POWER_OR_RANDOM" },
    implementationStatus: "implemented"
  },
  "dragon-line-attack-2": {
    id: "dragon-line-attack-2",
    name: "Dragon Breath",
    text: "Attack 2 spaces in a line: after the attack, a full separate attack at attack 2 strikes the unit directly behind the target (friend or foe). That unit is not adjacent, so it never retaliates.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 2 },
    implementationStatus: "implemented"
  },
  "dragon-line-attack-3": {
    id: "dragon-line-attack-3",
    name: "Dragon Breath",
    text: "Attack 2 spaces in a line: after the attack, a full separate attack at attack 3 strikes the unit directly behind the target (friend or foe). That unit is not adjacent, so it never retaliates.",
    effect: { type: "SECOND_ATTACK_BEHIND_TARGET", baseAttack: 3 },
    implementationStatus: "implemented"
  },
  "azure-dragon-paralysis": {
    id: "azure-dragon-paralysis",
    name: "Paralyzing Breath",
    text: 'If this unit resolves a "-1" on its Attack die, the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "basilisk-paralysis": {
    id: "basilisk-paralysis",
    name: "Stone Gaze",
    text: 'After the attack, roll 1 Attack die; on a "0" the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "extra", onRoll: 0 },
    implementationStatus: "implemented"
  },
  "fortress-basilisk-paralysis": {
    id: "fortress-basilisk-paralysis",
    name: "Stone Gaze",
    // Fortress Basilisks paralyse on a "-1" on their own Attack die (no extra
    // roll), exactly like the Azure Dragon's paralysis.
    text: 'On a "-1" on the Attack die, the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "hydra-multi-attack": {
    id: "hydra-multi-attack",
    name: "Hydra Assault",
    text: "Attacks up to 2 adjacent enemy units: after the primary attack, one more enemy adjacent to the Hydra takes a full separate attack at the Hydra's own attack value (you choose when several qualify). That follow-up never retaliates.",
    effect: { type: "SECOND_ATTACK_ONE_ADJACENT_TO_SELF" },
    implementationStatus: "implemented"
  },
  "medusa-paralyze-retaliation": {
    id: "medusa-paralyze-retaliation",
    name: "Paralyzing Gaze",
    text: "After this unit's Retaliation Attack, the target gains Paralysis (it skips its next activation; any damage clears it).",
    effect: { type: "PARALYZE_ON_RETALIATION" },
    implementationStatus: "implemented"
  },
  "medusa-paralyze-retaliation-die": {
    id: "medusa-paralyze-retaliation-die",
    name: "Paralyzing Gaze",
    text: 'After this unit\'s Retaliation Attack, roll an Attack die; on a "0" the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_ON_RETALIATION", onRoll: 0 },
    implementationStatus: "implemented"
  },
  "dread-knight-retaliation-defense": {
    id: "dread-knight-retaliation-defense",
    name: "Death Stare",
    text: "When this unit is targeted by a Retaliation Attack, it gains +1 Defense against it.",
    effect: { type: "DEFENSE_BONUS_WHEN_RETALIATED", amount: 1 },
    implementationStatus: "implemented"
  },
  "dragon-fly-retaliation-penalty": {
    id: "dragon-fly-retaliation-penalty",
    name: "Dazzling Flight",
    text: "Retaliation Attacks against this unit suffer -1 Attack.",
    effect: { type: "RETALIATION_AGAINST_ATTACK_PENALTY", amount: 1 },
    implementationStatus: "implemented"
  },
  // Dragon Fly Hive creature-bank card: the same Dazzling Flight, but the
  // retaliation penalty is -2 Attack instead of -1.
  "dragon-fly-retaliation-penalty-2": {
    id: "dragon-fly-retaliation-penalty-2",
    name: "Dazzling Flight",
    text: "Retaliation Attacks against this unit suffer -2 Attack.",
    effect: { type: "RETALIATION_AGAINST_ATTACK_PENALTY", amount: 2 },
    implementationStatus: "implemented"
  },
  // ---- Creature Bank "while Stacked" / on-attack bank-card abilities --------
  // Each below is wired and engine-enforced; the `requiresStacked` ones apply
  // only while the bank defender still carries its Stack Token.
  "bank-familiar-power-drain": {
    id: "bank-familiar-power-drain",
    name: "Power Drain",
    text: "As long as this unit is Stacked, the Power of every enemy spell is reduced by 1 (to a minimum of 0).",
    effect: { type: "REDUCE_ENEMY_SPELL_POWER", amount: 1 },
    requiresStacked: true,
    implementationStatus: "implemented"
  },
  "bank-black-dragon-stacked-attack": {
    id: "bank-black-dragon-stacked-attack",
    name: "Stacked Fury",
    text: "As long as this unit is Stacked, its Attack gains +3.",
    effect: { type: "FLAT_ATTACK_BONUS", amount: 3 },
    requiresStacked: true,
    implementationStatus: "implemented"
  },
  "bank-stacked-defense-token": {
    id: "bank-stacked-defense-token",
    name: "Fortified Hoard",
    text: "As long as this unit is Stacked, it is treated as if it had a Defense token on it (it rolls the Defend die when attacked).",
    effect: { type: "SELF_DEFENSE_TOKEN" },
    requiresStacked: true,
    implementationStatus: "implemented"
  },
  "bank-medusa-paralyze-stacked": {
    id: "bank-medusa-paralyze-stacked",
    name: "Petrifying Gaze",
    // engine: EVERY attack this unit makes petrifies — melee AND a ranged shot
    // at a distant foe (user rule 2026-07; applyOnAttackParalysis carries no
    // adjacency gate any more). Retaliation Attacks still never trigger it.
    text: "While Stacked, this unit's attack also Paralyzes the target — melee or ranged (it skips its next activation; any damage clears it).",
    effect: { type: "PARALYZE_TARGET_ON_ATTACK" },
    requiresStacked: true,
    implementationStatus: "implemented"
  },
  "bank-wraith-attack-discard": {
    id: "bank-wraith-attack-discard",
    name: "Soul Siphon",
    text: "Whenever this unit attacks, the enemy must discard 1 card from hand (if possible).",
    effect: { type: "ON_ATTACK_DISCARD_ENEMY_CARD", count: 1 },
    implementationStatus: "implemented"
  },
  "bank-faerie-dragon-spell-lock": {
    id: "bank-faerie-dragon-spell-lock",
    name: "Mind Veil",
    text: "As long as this unit is Stacked, the enemy cannot cast spells.",
    effect: { type: "SPELL_CAST_LOCK" },
    requiresStacked: true,
    implementationStatus: "implemented"
  },
  "dragon-fly-dispel": {
    id: "dragon-fly-dispel",
    name: "Dispel",
    text: "On attack, remove every ongoing effect the target's own controller placed on it (attack/defense/initiative buffs, Anti-Magic, etc.).",
    effect: { type: "DISPEL_ENEMY_EFFECTS_ON_TARGET" },
    implementationStatus: "implemented"
  },
  "dread-knight-retaliation-disadvantage": {
    id: "dread-knight-retaliation-disadvantage",
    name: "Curse of the Damned",
    text: "When this unit attacks, the enemy's Retaliation Attack rolls 2 Attack dice and resolves the lower result.",
    effect: { type: "RETALIATION_AGAINST_DISADVANTAGE" },
    implementationStatus: "implemented"
  },
  "wog-nightmare-fear": {
    id: "wog-nightmare-fear",
    name: "Fear",
    text: "When this unit is attacked (not on a Retaliation Attack), the attacker rolls 2 Attack dice and resolves the lower result.",
    effect: { type: "FEAR_ATTACKER_DISADVANTAGE" },
    implementationStatus: "implemented"
  },
  "ghost-dragon-morale-drain": {
    id: "ghost-dragon-morale-drain",
    name: "Aging",
    text: "When this unit activates, discard the enemy's positive morale token.",
    effect: { type: "ON_ACTIVATION_DISCARD_ENEMY_MORALE" },
    implementationStatus: "implemented"
  },
  "ghost-dragon-attack-die": {
    id: "ghost-dragon-attack-die",
    name: "Spectral Strike",
    text: "Add +1 to this unit's Attack die result on every attack.",
    effect: { type: "ATTACK_DIE_RESULT_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "ghost-dragon-knockback": {
    id: "ghost-dragon-knockback",
    name: "Knock Back",
    text: 'After the attack, roll 1 Attack die; on a "0" the target must immediately move away 1 space — the defending player chooses an empty space not adjacent to the Ghost Dragons. Pushed out of reach, the target cannot retaliate. With no valid space it stays and retaliates as normal.',
    effect: { type: "KNOCKBACK_AFTER_ATTACK", onRoll: 0 },
    implementationStatus: "implemented"
  },
  "wraith-heal-1": {
    id: "wraith-heal-1",
    name: "Regeneration",
    text: "When this unit activates, remove up to 1 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 1 },
    implementationStatus: "implemented"
  },
  "wraith-heal-2": {
    id: "wraith-heal-2",
    name: "Regeneration",
    text: "When this unit activates, remove up to 2 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  "troll-heal-3": {
    id: "troll-heal-3",
    name: "Regeneration",
    text: "When this unit activates, remove up to 3 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 3 },
    implementationStatus: "implemented"
  },
  "wraith-enemy-discard": {
    id: "wraith-enemy-discard",
    name: "Mana Drain",
    text: "When this unit activates, discard 1 random card from the enemy's hand.",
    effect: { type: "ON_ACTIVATION_DISCARD_ENEMY_CARD", count: 1 },
    implementationStatus: "implemented"
  },
  "archangel-combat-start-draw": {
    id: "archangel-combat-start-draw",
    name: "Heavenly Blessing",
    text: "When combat begins, the controller draws 1 card.",
    effect: { type: "ON_COMBAT_START_DRAW", amount: 1 },
    implementationStatus: "implemented"
  },
  "crystal-dragon-valuables": {
    id: "crystal-dragon-valuables",
    name: "Crystal Hoard",
    text: "While in your army: at the beginning of each Resource round, gain 2 valuables.",
    mapEffect: { type: "MAP_RESOURCE_ROUND_GAIN", resource: "valuables", amount: 2 },
    implementationStatus: "implemented"
  },
  "peasant-gold-income": {
    id: "peasant-gold-income",
    name: "Taxpayers",
    text: "While in your army: at the beginning of each Resource round, gain 3 gold.",
    mapEffect: { type: "MAP_RESOURCE_ROUND_GAIN", resource: "gold", amount: 3 },
    implementationStatus: "implemented"
  },
  "nomad-end-turn-step": {
    id: "nomad-end-turn-step",
    name: "Wanderer",
    text: "While in your army: at the end of your turn, move your Hero's model to an adjacent empty field.",
    mapEffect: { type: "MAP_END_TURN_HERO_STEP" },
    implementationStatus: "implemented"
  },
  "rogue-deck-peek": {
    id: "rogue-deck-peek",
    name: "Scouting",
    text: "While in your army: once during your turn, look at the top card from any deck, then put it back on the top or on the bottom of that deck.",
    mapEffect: { type: "MAP_TURN_DECK_PEEK" },
    implementationStatus: "implemented"
  },
  "enchanter-heal-or-buff": {
    id: "enchanter-heal-or-buff",
    name: "Enchant",
    text: "[activation] Remove up to 2 damage from a chosen friendly unit. If — and only if — there is no friendly unit you can heal, instead gain +1 Attack for the combat round. The heal is mandatory whenever possible (it can not be skipped in favor of +1 Attack). Enchanters can not heal themselves. This does not end the activation — the unit still moves and attacks.",
    effect: { type: "ON_ACTIVATION_HEAL_FRIENDLY_OR_BUFF_SELF", healAmount: 2, attackBonus: 1 },
    implementationStatus: "implemented"
  },
  "faerie-dragon-spell": {
    id: "faerie-dragon-spell",
    name: "Faerie Bolt",
    text: "[activation] The selected unit suffers 2 damage — a spell that does not count towards your spell limit. (A neutral Faerie Dragon targets it like a normal attack.) Then the unit acts normally.",
    effect: { type: "ON_ACTIVATION_DAMAGE_SPELL", amount: 2 },
    implementationStatus: "implemented"
  },
  "harpy-return": {
    id: "harpy-return",
    name: "Strike and Return",
    text: "After the enemy's Retaliation Attack, this unit can return to the space it moved from to attack. (A neutral Harpy always returns; a player chooses to return or stay.)",
    effect: { type: "RETURN_TO_ORIGIN_AFTER_ATTACK" },
    implementationStatus: "implemented"
  },
  "summon-demons": {
    id: "summon-demons",
    name: "Summon Demons",
    // Official: only ONE Demons unit on the field (Few or Pack) — summon is
    // blocked while any living Demons already stand for that player; reinforce
    // Few→Pack stays legal. House rule `multi-demon-summon` (BINH default ON)
    // allows summoning a new Few even when Demons are already present.
    text: "[unit_other] If one of your units has been removed from the board during this Combat, Summon a Few of Demons on an adjacent space, Reinforce a Few of Demons up to a Pack, or (with Unit Stacks) add a free Stack to a living Pack of Demons (once per Combat, instead of moving or attacking). Official: only 1 Demons unit on the field (Few or Pack). House rule (multi-demon-summon): may summon additional Demons stacks.",
    effect: { type: "SUMMON_OR_REINFORCE_DEMONS", demonUnitDefId: "inferno.demons" },
    implementationStatus: "implemented"
  },
  "ignore-paralysis": {
    id: "ignore-paralysis",
    name: "Immune to Paralysis",
    text: "This unit ignores Paralysis: it can never gain a Paralysis token.",
    effect: { type: "IGNORE_PARALYSIS" },
    implementationStatus: "implemented"
  },
  "archangel-hate-devils": {
    id: "archangel-hate-devils",
    name: "Hatred",
    text: "When attacking Arch Devils, this unit gains +2 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Arch Devils", amount: 2 },
    implementationStatus: "implemented"
  },
  "arch-devil-hate-angels": {
    id: "arch-devil-hate-angels",
    name: "Hatred",
    text: "When attacking Archangels, this unit gains +2 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Archangels", amount: 2 },
    implementationStatus: "implemented"
  },
  "genie-hate-efreet": {
    id: "genie-hate-efreet",
    name: "Hatred",
    text: "When attacking Efreet, this unit gains +1 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Efreet", amount: 1 },
    implementationStatus: "implemented"
  },
  "titan-hate-black-dragons": {
    id: "titan-hate-black-dragons",
    name: "Hatred",
    text: "When attacking Black Dragons, this unit gains +2 Attack.",
    effect: { type: "ATTACK_BONUS_VS_UNIT_NAME", unitName: "Black Dragons", amount: 2 },
    implementationStatus: "implemented"
  },
  "zombie-resilience": {
    id: "zombie-resilience",
    name: "Undying Resilience",
    text: 'If the attacker resolves a "0" or "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    effect: { type: "DEFENSE_BONUS_ON_ATTACK_DIE", minRoll: 0, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "zombie-resilience-weak": {
    id: "zombie-resilience-weak",
    name: "Undying Resilience",
    text: 'If the attacker resolves a "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    effect: { type: "DEFENSE_BONUS_ON_ATTACK_DIE", minRoll: 1, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "manticore-thick-hide": {
    id: "manticore-thick-hide",
    name: "Thick Hide",
    text: 'If the attacker resolves a "0" or "+1" on the Attack die, this unit gains +1 Defense against that attack.',
    effect: { type: "DEFENSE_BONUS_ON_ATTACK_DIE", minRoll: 0, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "dread-knight-death-blow": {
    id: "dread-knight-death-blow",
    name: "Death Blow",
    text: 'If you resolve a "0" or "+1" on the Attack die, increase this unit\'s total Attack by 1.',
    effect: { type: "ATTACK_BONUS_ON_ATTACK_DIE", minRoll: 0, maxRoll: 1, amount: 1 },
    implementationStatus: "implemented"
  },
  "manticore-ignore-defense": {
    id: "manticore-ignore-defense",
    name: "Piercing Strike",
    text: "For this attack, ignore the Defense value printed on the target's card.",
    effect: { type: "IGNORE_TARGET_CARD_DEFENSE" },
    implementationStatus: "implemented"
  },
  "wyvern-sting": {
    id: "wyvern-sting",
    name: "Poison Sting",
    text: 'After the attack, roll 1 Attack die; on a "0" deal 1 damage to the target.',
    effect: { type: "ATTACK_DIE_FLAT_DAMAGE_TO_TARGET", minRoll: 0, maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "rust-dragon-acid": {
    id: "rust-dragon-acid",
    name: "Acid Breath",
    text: 'On a "-1" on the Attack die, place an Acid token on the target: -2 Defense (to a minimum of 0) for the rest of the combat.',
    effect: { type: "ON_ATTACK_DIE_TOKEN", onRoll: -1, token: "corrosion", amount: 2 },
    implementationStatus: "implemented"
  },
  "gorgon-death-stare": {
    id: "gorgon-death-stare",
    name: "Death Stare",
    text: 'After the attack, roll 2 Attack dice; on two "-1" results, reduce the target\'s Health to 0.',
    effect: { type: "DEATH_STARE_ON_DICE", diceCount: 2, onRoll: -1 },
    implementationStatus: "implemented"
  },
  "fortress-gorgon-death-stare": {
    id: "fortress-gorgon-death-stare",
    name: "Death Stare",
    // Fortress Mighty Gorgons (Pack) trigger on a double "0" instead of "-1".
    text: 'After the attack, roll 2 Attack dice; on a double "0", reduce the target\'s Health to 0.',
    effect: { type: "DEATH_STARE_ON_DICE", diceCount: 2, onRoll: 0 },
    implementationStatus: "implemented"
  },
  // ——— Raid-boss arms (§6.5/§6.8; carried by src/data/anime/bosses.ts and
  // designer custom bosses — never printed on a deck unit side) ———
  "boss-devour": {
    id: "boss-devour",
    name: "Devour",
    text:
      'After this unit\'s own attack against a BRONZE unit, roll 1 Attack die; on a "+1" the target side is removed outright (a Pack flips to its Few side). Silver and higher — and tierless targets — are never devoured.',
    effect: { type: "DEATH_STARE_ON_DICE", diceCount: 1, onRoll: 1, targetGradeAtMost: "bronze" },
    implementationStatus: "implemented"
  },
  "boss-fear": {
    id: "boss-fear",
    name: "Fear",
    text:
      "While this unit lives, the enemy cannot USE morale: the +1 morale token and held Positive Morale cards cannot be spent (no reroll or set-die source, no redraw, no combat bonus, no token removal). Morale is still gained and morale cards are still drawn — only using them is locked.",
    effect: { type: "MORALE_LOCK" },
    implementationStatus: "implemented"
  },
  "boss-enrage": {
    id: "boss-enrage",
    name: "Enrage",
    text: "While this boss is on its LAST health layer, its Attack gains +2 (attacks and Retaliation Attacks).",
    effect: { type: "FLAT_ATTACK_BONUS", amount: 2 },
    requiresLayersAtMost: 1,
    implementationStatus: "implemented"
  },
  "archangel-lethal-save": {
    id: "archangel-lethal-save",
    name: "Resurrection",
    text: "Once per Combat, cancel an attack that would reduce another friendly unit's Health to 0 (any grade, no cost).",
    effect: { type: "CANCEL_LETHAL_UNIT_ABILITY" },
    implementationStatus: "implemented"
  },
  "softball-power-pitch": {
    id: "softball-power-pitch",
    name: "Power Pitch",
    text: "[unit_attack] When this unit's own Attack die is -1 or 0, deal 1 additional attack damage to the target.",
    effect: { type: "EXTRA_RANGED_DAMAGE_ON_LOW_ROLL", maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "haruka-prank-backfire": {
    id: "haruka-prank-backfire",
    name: "Prank Backfire",
    text: "[unit_attack] When this unit's own Attack die is -1, Paralyze the target after the attack.",
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "disciplinary-sanction": {
    id: "disciplinary-sanction",
    name: "Disciplinary Sanction",
    text: "[unit_passive] At the start of Combat, choose 1 enemy unit. It gets -1 Attack during round 1.",
    effect: { type: "ON_COMBAT_START_ENEMY_ATTACK_PENALTY", amount: -1, rounds: 1 },
    implementationStatus: "implemented"
  },
  "saya-infiltration": {
    id: "saya-infiltration",
    name: "Infiltration",
    text: "[unit_move] As a move, place this unit on any empty Combat space.",
    effect: { type: "MOVE_ANYWHERE" },
    implementationStatus: "implemented"
  },
  "saya-armor-break": {
    id: "saya-armor-break",
    name: "Armor Break",
    text: '[unit_attack] On a "0" or "+1" on this unit\'s Attack die, place a Corrosion token on the target: -1 Defense (minimum 0) for the rest of Combat.',
    effect: { type: "ON_ATTACK_DIE_TOKEN", minRoll: 0, maxRoll: 1, token: "corrosion", amount: 1 },
    implementationStatus: "implemented"
  },
  // Save compatibility: a combat saved before Armor Break replaced Double Tap
  // can still carry the old id. It resolves the NEW mechanic after loading.
  "saya-double-tap": {
    id: "saya-double-tap",
    name: "Armor Break",
    text: '[unit_attack] On a "0" or "+1" on this unit\'s Attack die, place a Corrosion token on the target: -1 Defense (minimum 0) for the rest of Combat.',
    effect: { type: "ON_ATTACK_DIE_TOKEN", minRoll: 0, maxRoll: 1, token: "corrosion", amount: 1 },
    implementationStatus: "implemented"
  },
  "masato-bodyguard-intercept": {
    id: "masato-bodyguard-intercept",
    name: "Bodyguard",
    text: "[unit_passive] Once per Combat, when an adjacent friendly unit is attacked, redirect that attack to this unit.",
    effect: { type: "INTERCEPT_ADJACENT_ATTACK_ONCE" },
    implementationStatus: "implemented"
  },
  "mgq-pack-dig": {
    id: "mgq-pack-dig",
    name: "Pack Dig",
    text: "[activation] Instead of attacking, place an Obstacle in an adjacent empty Combat space. This may be used after moving.",
    effect: { type: "PLACE_ADJACENT_OBSTACLE_ACTION" },
    implementationStatus: "implemented"
  },
  "mgq-trance-pollen": {
    id: "mgq-trance-pollen",
    name: "Trance Pollen",
    text: "[unit_attack] On a +1 Attack die result, place a Temptation token on the target.",
    effect: { type: "ON_ATTACK_DIE_TOKEN", onRoll: 1, token: "temptation", amount: 1 },
    implementationStatus: "implemented"
  },
  "mgq-white-magic": {
    id: "mgq-white-magic",
    name: "White Magic",
    text: "[activation] Choose an adjacent ally: heal exactly 1 damage or give that ally +1 Attack this round.",
    effect: {
      type: "MGQ_WHITE_MAGIC_ACTION",
      healAmount: 1,
      attackBonus: 1
    },
    implementationStatus: "implemented"
  },
  "mgq-job-heal-adjacent": {
    id: "mgq-job-heal-adjacent",
    name: "Healer's Aid",
    text: "[activation] Choose a wounded adjacent ally and heal exactly 1 damage. This cannot target the healer.",
    effect: {
      type: "MGQ_WHITE_MAGIC_ACTION",
      healAmount: 1,
      attackBonus: 0
    },
    implementationStatus: "implemented"
  },
  "mgq-noble-income": {
    id: "mgq-noble-income",
    name: "Noble Stipend",
    text: "[map] At the beginning of each Resource round, gain 1 gold.",
    mapEffect: { type: "MAP_RESOURCE_ROUND_GAIN", resource: "gold", amount: 1 },
    implementationStatus: "implemented"
  },
  "mgq-hero-rebirth": {
    id: "mgq-hero-rebirth",
    name: "Heroic Return",
    text: '[unit_passive] Once per Combat when this unit would be defeated, roll an Attack die. On "-1" or "0", it returns at 1 Health.',
    effect: { type: "SELF_REBIRTH_ROLL_ONCE", maxRoll: 0 },
    implementationStatus: "implemented"
  },
  "mgq-gadabout-xp": {
    id: "mgq-gadabout-xp",
    name: "Learning by Wandering",
    text: "[map] After this unit survives a won combat, it gains 1 additional unit experience.",
    effect: { type: "BONUS_UNIT_EXPERIENCE", amount: 1 },
    implementationStatus: "implemented"
  },
  "mgq-maid-speed-aura": {
    id: "mgq-maid-speed-aura",
    name: "Perfect Service",
    text: "[unit_passive] Other adjacent friendly units gain +2 Initiative only while they remain adjacent to this unit.",
    effect: { type: "FRIENDLY_ADJACENT_INITIATIVE_AURA", amount: 2 },
    implementationStatus: "implemented"
  },
  "mgq-mage-magic-arrow": {
    id: "mgq-mage-magic-arrow",
    name: "Magic Arrow",
    text: "[activation] Once per Combat before moving, deal 1 damage to an enemy unit. This does not end the activation.",
    effect: { type: "MGQ_MAGE_MAGIC_ARROW_ACTION", amount: 1 },
    implementationStatus: "implemented"
  },
  "mgq-hunter-low-roll-pierce": {
    id: "mgq-hunter-low-roll-pierce",
    name: "Hunter's Opening",
    text: "[unit_attack] On a -1 or 0 Attack die result, ignore 1 Defense for this attack.",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK_DIE", minRoll: -1, maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "mgq-wild-hair": {
    id: "mgq-wild-hair",
    name: "Wild Hair",
    text: "While this side is damaged, its Attack gains +1.",
    effect: { type: "FLAT_ATTACK_BONUS", amount: 1, requiresDamaged: true },
    implementationStatus: "implemented"
  },
  "mgq-devour": {
    id: "mgq-devour",
    name: "Devour",
    text: "When this unit removes a Paralyzed or Tempted target side with its own attack, heal this unit to full.",
    effect: { type: "ON_KILL_HEAL_FULL_IF_TARGET_TOKEN", tokens: ["paralysis", "temptation"] },
    implementationStatus: "implemented"
  },
  "mgq-confusion-club": {
    id: "mgq-confusion-club",
    name: "Confusion Club",
    text: "[unit_attack] On a +1 Attack die result, place a Weakness token on the target.",
    effect: { type: "ON_ATTACK_DIE_TOKEN", onRoll: 1, token: "weakness", amount: -1 },
    implementationStatus: "implemented"
  },
  "mgq-nightmares-embrace": {
    id: "mgq-nightmares-embrace",
    name: "Nightmare's Embrace",
    text: "[unit_attack] On a +1 Attack die result, Paralyze the target.",
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: 1 },
    implementationStatus: "implemented"
  },
  "mgq-maiden-certain-paralysis": {
    id: "mgq-maiden-certain-paralysis",
    name: "Nightmare's Embrace",
    text: "[unit_attack] After this unit attacks, Paralyze the target.",
    effect: { type: "ON_ATTACK_TOKEN", token: "paralysis", amount: 0 },
    implementationStatus: "implemented"
  },
  "mgq-sleep-toxin": {
    id: "mgq-sleep-toxin",
    name: "Sleep Toxin",
    text: "[unit_attack] After this unit deals damage, place a Temptation token on the target.",
    effect: {
      type: "ON_ATTACK_TOKEN",
      token: "temptation",
      amount: 1,
      requiresDamageDealt: true
    },
    implementationStatus: "implemented"
  },
  "mgq-slimed": {
    id: "mgq-slimed",
    name: "Slimed",
    text: "[unit_attack] After this unit deals damage, place a Corrosion token on the target.",
    effect: {
      type: "ON_ATTACK_TOKEN",
      token: "corrosion",
      amount: -1,
      requiresDamageDealt: true
    },
    implementationStatus: "implemented"
  },
  "mgq-slowed-time": {
    id: "mgq-slowed-time",
    name: "Slowed Time",
    text: "Adjacent enemies have -1 Initiative while this unit lives.",
    effect: { type: "ADJACENT_ENEMY_INITIATIVE_AURA", amount: -1 },
    implementationStatus: "implemented"
  },
  // Save compatibility for the provisional implementation id used before the
  // MGQ roster was finalized.
  "mgq-slowed-time-aura": {
    id: "mgq-slowed-time-aura",
    name: "Slowed Time",
    text: "Adjacent enemies have -1 Initiative while this unit lives.",
    effect: { type: "ADJACENT_ENEMY_INITIATIVE_AURA", amount: -1 },
    implementationStatus: "implemented"
  },
  "mgq-lisa-growth": {
    id: "mgq-lisa-growth",
    name: "Soul Growth",
    text: "When this unit reduces a unit side or stack layer to 0 Health, permanently gain +1 maximum Health (maximum +2).",
    effect: { type: "ON_LETHAL_HIT_GAIN_PERMANENT_HEALTH", amount: 1, maxBonus: 2 },
    implementationStatus: "implemented"
  },
  "mgq-slow-weave": {
    id: "mgq-slow-weave",
    name: "Slow Weave",
    text: "[unit_attack] After this unit deals damage, the target gets -1 Initiative for the current round.",
    effect: {
      type: "ON_ATTACK_INITIATIVE_DEBUFF",
      amount: -1,
      requiresDamageDealt: true,
      duration: { type: "current-combat-round" }
    },
    implementationStatus: "implemented"
  },
  "mgq-reaper-scythe": {
    id: "mgq-reaper-scythe",
    name: "Reaper Scythe",
    text: "This unit gains +2 Attack against Paralyzed, Weakened, or Tempted targets.",
    effect: {
      type: "ATTACK_BONUS_VS_TARGET_TOKENS",
      amount: 2,
      tokens: ["paralysis", "weakness", "temptation"]
    },
    implementationStatus: "implemented"
  },
  "mgq-flower-fragrance": {
    id: "mgq-flower-fragrance",
    name: "Flower Fragrance",
    text: "After this unit's Retaliation Attack, place a Temptation token on the target.",
    effect: {
      type: "ON_ATTACK_TOKEN",
      token: "temptation",
      amount: 1,
      trigger: "retaliation"
    },
    implementationStatus: "implemented"
  },
  "mgq-love-arrow": {
    id: "mgq-love-arrow",
    name: "Love Arrow",
    text: "[unit_attack] On a +1 Attack die result, place 2 Temptation tokens on the target.",
    effect: { type: "ON_ATTACK_DIE_TOKEN", onRoll: 1, token: "temptation", amount: 1, count: 2 },
    implementationStatus: "implemented"
  },
  "mgq-web-the-field": {
    id: "mgq-web-the-field",
    name: "Web the Field",
    text: "[activation] Place Weakness on an adjacent enemy and gain a Defense token.",
    effect: {
      type: "PLACE_TOKEN_ACTION",
      token: "weakness",
      amount: -1,
      targets: "enemy",
      rounds: 2,
      adjacentOnly: true,
      sourceDefenseToken: true
    },
    implementationStatus: "implemented"
  },
  "mgq-colossal-max-health": {
    id: "mgq-colossal-max-health",
    name: "Colossal",
    text: "This unit has 50% more maximum Health (rounded up).",
    effect: { type: "MAX_HEALTH_MULTIPLIER", numerator: 3, denominator: 2 },
    implementationStatus: "implemented"
  },
  "mgq-giga-regeneration": {
    id: "mgq-giga-regeneration",
    name: "Regeneration",
    text: "[activation] At the start of this unit's activation, remove up to 2 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  "mgq-sparkle": {
    id: "mgq-sparkle",
    name: "Sparkle☆",
    text: "At the start of Combat, this unit's owner gains 1 positive Morale.",
    effect: { type: "ON_COMBAT_START_GAIN_MORALE", amount: 1 },
    implementationStatus: "implemented"
  },
  "elemental-damage": {
    id: "elemental-damage",
    name: "Elemental Damage",
    text: "[unit_passive] This unit deals elemental damage: its attack cannot be raised by attack cards or Attack tokens, only lowered (e.g. by a Sorceress' Weakness).",
    effect: { type: "DEALS_ELEMENTAL_DAMAGE" },
    implementationStatus: "implemented"
  },
  // Elemental spell immunity — "Immune to Magic Arrow and <element> Magic
  // spells." Air/Storm share Air; Earth/Magma share Earth; Fire/Energy share
  // Fire; Water/Ice share Water. Magic Elementals are immune to Magic Arrow
  // only. "any" is Magic Arrow's school (see IMMUNE_TO_SPELL_SCHOOLS).
  "air-elemental-immunity": {
    id: "air-elemental-immunity",
    name: "Air Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Air Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "air"] },
    implementationStatus: "implemented"
  },
  "earth-elemental-immunity": {
    id: "earth-elemental-immunity",
    name: "Earth Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Earth Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "earth"] },
    implementationStatus: "implemented"
  },
  "fire-elemental-immunity": {
    id: "fire-elemental-immunity",
    name: "Fire Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Fire Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "fire"] },
    implementationStatus: "implemented"
  },
  "water-elemental-immunity": {
    id: "water-elemental-immunity",
    name: "Water Immunity",
    text: "[unit_passive] Immune to Magic Arrow and Water Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "water"] },
    implementationStatus: "implemented"
  },
  "magic-elemental-immunity": {
    id: "magic-elemental-immunity",
    name: "Magic Arrow Immunity",
    text: "[unit_passive] Immune to Magic Arrow.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any"] },
    implementationStatus: "implemented"
  },
  // Neutral Minotaurs: "[unit_attack] Reroll this unit's '-1' outcome on the
  // Attack die." Face-gated (only while the die shows "-1") and — like every
  // "[unit_attack]" icon ability — usable ONCE PER ATTACK: a reroll into a
  // second "-1" stands. Re-arms on the unit's next declared attack.
  "minotaur-reroll": {
    id: "minotaur-reroll",
    name: "Minotaur Fury",
    text: 'Reroll a "-1" on this unit\'s Attack die — the new result replaces the old one. Once per attack.',
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, onlyOnRoll: -1 },
    implementationStatus: "implemented"
  },
  // Efreet: a non-Elemental unit that still carries the Fire/Magic-Arrow
  // immunity (it does NOT deal elemental damage, so no DEALS_ELEMENTAL_DAMAGE).
  "efreet-fire-immunity": {
    id: "efreet-fire-immunity",
    name: "Fire Immunity",
    text: "[unit_passive] Ignores any damage from Magic Arrows or spells from the Fire School of Magic.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "fire"] },
    implementationStatus: "implemented"
  },
  // Phoenixes: immune to Fire Magic only (NOT Magic Arrow).
  "phoenix-fire-immunity": {
    id: "phoenix-fire-immunity",
    name: "Fire Immunity",
    text: "[unit_passive] Immune to Fire Magic spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["fire"] },
    implementationStatus: "implemented"
  },
  "phoenix-rebirth": {
    id: "phoenix-rebirth",
    name: "Rebirth",
    text: "[unit_passive] Once per Combat, when this unit's Health would drop to 0, set it to 1 instead.",
    effect: { type: "SELF_REBIRTH_ONCE" },
    implementationStatus: "implemented"
  },
  "reduce-spell-damage-2": {
    id: "reduce-spell-damage-2",
    name: "Spell Resistance",
    text: "[unit_passive] Reduce any damage from spells by 2 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE", amount: 2 },
    implementationStatus: "implemented"
  },
  "reduce-spell-damage-3": {
    id: "reduce-spell-damage-3",
    name: "Spell Resistance",
    text: "[unit_passive] Reduce any damage from spells by 3 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE", amount: 3 },
    implementationStatus: "implemented"
  },
  "reduce-spell-and-specialty-damage-2": {
    id: "reduce-spell-and-specialty-damage-2",
    name: "Magical Resistance",
    text: "[unit_passive] Reduce any damage this unit takes from spells or Specialty by 2 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_AND_SPECIALTY_DAMAGE", amount: 2 },
    implementationStatus: "implemented"
  },
  "little-busters-komari-smile-ward": {
    id: "little-busters-komari-smile-ward",
    name: "Everyone Smiles",
    text: "[unit_passive] This unit and all adjacent units receive 1 less damage from spells or Hero Specialties (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_AND_SPECIALTY_DAMAGE_AURA", amount: 1 },
    implementationStatus: "implemented"
  },
  "little-busters-kud-random-follow-up": {
    id: "little-busters-kud-random-follow-up",
    name: "Unexpected Trajectory",
    text: "[unit_attack] After this unit attacks, it attacks one other random enemy as a separate attack.",
    effect: { type: "SECOND_ATTACK_RANDOM_OTHER_ENEMY" },
    implementationStatus: "implemented"
  },
  "little-busters-rin-second-attack": {
    id: "little-busters-rin-second-attack",
    name: "Catlike Combo",
    text: "[unit_attack] After the target retaliates, attack it again with -1 Attack.",
    effect: { type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION", attackModifier: -1 },
    implementationStatus: "implemented"
  },
  "vampire-heal-on-attack": {
    id: "vampire-heal-on-attack",
    name: "Life Drain",
    text: "[unit_attack] After this unit's attack, remove up to 2 damage from it.",
    effect: { type: "ON_ATTACK_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  // Crypt creature-bank Vampires: "After the attack, remove ALL damage from
  // this unit." The shared self-heal handler clamps to current damage, so a
  // healthy margin removes every point of damage on any Stacked size.
  "bank-vampire-life-drain": {
    id: "bank-vampire-life-drain",
    name: "Life Drain",
    text: "[unit_attack] After this unit's attack, remove all damage from it.",
    effect: { type: "ON_ATTACK_HEAL_SELF", amount: 9 },
    implementationStatus: "implemented"
  },
  "halberdier-defense-aura": {
    id: "halberdier-defense-aura",
    name: "Phalanx",
    text: "[unit_passive] Treat allied units adjacent to this unit as if they had a Defense token.",
    effect: { type: "DEFENSE_TOKEN_AURA" },
    implementationStatus: "implemented"
  },
  "halberdier-die-ignore": {
    id: "halberdier-die-ignore",
    name: "Parry",
    text: "[unit_passive] When this unit is targeted by an attack, you may discard a card to ignore the Attack die's roll result (treat it as 0). Offered in the post-roll window when the die came up \"+1\".",
    effect: { type: "DISCARD_TO_IGNORE_ATTACK_DIE" },
    implementationStatus: "implemented"
  },
  "familiar-spell-tax": {
    id: "familiar-spell-tax",
    name: "Mana Leech",
    text: "[unit_passive] Whenever an enemy casts a spell from hand, they must discard 1 card from hand.",
    effect: { type: "SPELL_CAST_HAND_TAX" },
    implementationStatus: "implemented"
  },
  // Castle Champions (Few): the only printed ability on the Few side.
  "champion-stables-discount": {
    id: "champion-stables-discount",
    name: "Stable Master",
    text: "[map_effect] If your hero is on a field with Stables, this unit's reinforcement cost is reduced by 6 gold.",
    mapEffect: { type: "MAP_REINFORCE_DISCOUNT", location: "stables", amount: 6 },
    implementationStatus: "implemented"
  },
  // Castle Champions (Pack): the only printed ability on the Pack side.
  "champion-move-reroll": {
    id: "champion-move-reroll",
    name: "Charge",
    text: "[unit_attack] If this unit's movement ends in a space other than where it started, you may reroll an Attack die.",
    effect: { type: "ATTACK_DIE_REROLL", rerollsPerAttack: 1, requiresMoved: true },
    implementationStatus: "implemented"
  },
  // Neutral Champions ([unit_attack], own attacks only): roll 2 Attack dice and
  // sum both. On a Retaliation Attack this does NOT apply — the champion rolls a
  // single die then (the "-1" reroll passive below still fires on that die).
  "champion-roll-two-dice": {
    id: "champion-roll-two-dice",
    name: "Champion's Charge",
    text: '[unit_attack] Roll 2 Attack dice and apply both outcomes.',
    effect: { type: "ROLL_TWO_DICE_APPLY_BOTH" },
    implementationStatus: "implemented"
  },
  // Neutral Champions ([unit_passive], always on): reroll every "-1" this unit
  // rolls — repeatedly, until it is not "-1". Covers its Attack dice (own attack
  // AND retaliation) and its Defend die alike.
  "champion-reroll-minus": {
    id: "champion-reroll-minus",
    name: "Unstoppable",
    text: '[unit_passive] Reroll this unit\'s all "-1" rolls.',
    effect: { type: "REROLL_ALL_MINUS_ONE" },
    implementationStatus: "implemented"
  },
  // Mummies: own attack die counts as 0; an attacker's die is forced to -1.
  "mummy-ignore-own-die": {
    id: "mummy-ignore-own-die",
    name: "Cursed Strike",
    text: "[unit_attack] Ignore the result on this unit's Attack die (it always counts as 0).",
    effect: { type: "IGNORE_OWN_ATTACK_DIE" },
    implementationStatus: "implemented"
  },
  "mummy-force-attacker-die": {
    id: "mummy-force-attacker-die",
    name: "Mummy's Curse",
    text: 'Whenever this unit is attacked, the attacker\'s Attack die is set to "-1".',
    effect: { type: "FORCE_ATTACKER_DIE", value: -1 },
    implementationStatus: "implemented"
  },
  // Azure Dragons / Black Dragons (Pack): immune to every Spell, and to damage
  // from Specialty cards (non-damage Specialty effects still apply).
  "immune-all-spells": {
    id: "immune-all-spells",
    name: "Spell Immunity",
    text: "[unit_passive] Immune to all Spells.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any", "air", "earth", "fire", "water"] },
    implementationStatus: "implemented"
  },
  "immune-specialty-damage": {
    id: "immune-specialty-damage",
    name: "Specialty Ward",
    text: "[unit_passive] Ignore damage from Specialty cards (non-damage Specialty effects still apply).",
    effect: { type: "IMMUNE_TO_SPECIALTY_DAMAGE" },
    implementationStatus: "implemented"
  },
  // Fortress Wyverns: the poison-cube damage-over-time (distinct from the
  // neutral Wyvern's die-roll "wyvern-sting"). The Few plants 1 cube, the Pack
  // 2; each of the target's activations removes one cube for 1 damage.
  "wyvern-poison-cube-few": {
    id: "wyvern-poison-cube-few",
    name: "Poison",
    text: "[unit_attack] Place 1 faction cube on the target. At the beginning of its every activation, remove it to inflict 1 damage.",
    effect: { type: "ON_ATTACK_POISON_CUBES", count: 1 },
    implementationStatus: "implemented"
  },
  "wyvern-poison-cube-pack": {
    id: "wyvern-poison-cube-pack",
    name: "Poison",
    text: "[unit_attack] Place 2 faction cubes on the target. At the beginning of its every activation, remove 1 of them to inflict 1 damage.",
    effect: { type: "ON_ATTACK_POISON_CUBES", count: 2 },
    implementationStatus: "implemented"
  },
  // Rampart Dwarves: roll an Attack die whenever a Spell or Specialty targets
  // them; a "+1" shrugs the whole card off (friendly buffs included).
  "dwarf-magic-resistance": {
    id: "dwarf-magic-resistance",
    name: "Magic Resistance",
    text: '[unit_passive] If this unit is targeted by any Spell or Specialty card, roll 1 Attack die. On a "+1" result, ignore the card\'s effect.',
    effect: { type: "NEGATE_CARD_ON_DIE", onRoll: 1 },
    implementationStatus: "implemented"
  },
  // Rampart Pegasi (Pack): a living Pegasi shaves 1 Power off every Spell the
  // opposing side casts (to a minimum of 0).
  "pegasi-magic-damper": {
    id: "pegasi-magic-damper",
    name: "Magic Damper",
    text: "[unit_passive] The Power of all enemy spells is reduced by 1 (to a minimum of 0).",
    effect: { type: "REDUCE_ENEMY_SPELL_POWER", amount: 1 },
    implementationStatus: "implemented"
  },
  // Neutral Pegasi (a different printed ability from the Rampart Pegasi above):
  // taxes each enemy Spell cast by one extra Power card from the caster's hand.
  "pegasi-power-tax": {
    id: "pegasi-power-tax",
    name: "Mystic Toll",
    text: "[unit_passive] An enemy may cast a Spell only by also discarding a card with Power; with no Power card to pay, they cannot cast at all.",
    effect: { type: "SPELL_CAST_POWER_TAX" },
    implementationStatus: "implemented"
  },
  // Rampart Dendroids (Pack): enemies beginning their activation next to a
  // Dendroid are rooted in place for that activation (they may still attack).
  "dendroid-bind": {
    id: "dendroid-bind",
    name: "Bind",
    text: "[unit_passive] Enemy units that start their activation adjacent to this unit cannot move.",
    effect: { type: "BIND_ADJACENT_ENEMIES" },
    implementationStatus: "implemented"
  },
  // Tower Gargoyles: immune to ongoing effects that come from a Spell (other
  // ongoing sources, e.g. artifacts, still affect them).
  "gargoyle-spell-ward": {
    id: "gargoyle-spell-ward",
    name: "Spell Ward",
    text: "[unit_passive] This unit ignores any ongoing Spell effects.",
    effect: { type: "IGNORE_ONGOING_SPELL_EFFECTS" },
    implementationStatus: "implemented"
  },
  // Tower Titans: immune to every ongoing effect on themselves — from Spells,
  // Artifacts or Specialties, friendly or hostile.
  "titan-ignore-ongoing": {
    id: "titan-ignore-ongoing",
    name: "Unbreakable Will",
    text: "[unit_passive] Ignore any ongoing effects on this unit.",
    effect: { type: "IGNORE_ONGOING_EFFECTS" },
    implementationStatus: "implemented"
  },
  // Neutral Satyrs (silver): once per turn on the adventure map, roll 1 Attack
  // die; on "+1" gain positive morale. Gated by satyrMoraleRollUsedThisTurn.
  "satyr-map-morale-roll": {
    id: "satyr-map-morale-roll",
    name: "Forest Blessing",
    text: "[map_effect] Once per turn. Roll an Attack die. On a \"+1\", gain [morale_positive].",
    mapEffect: { type: "MAP_TURN_MORALE_ROLL" },
    implementationStatus: "implemented"
  },
  // Neutral Fangarm (silver, flying): passively ignores all ongoing effects from
  // spell OR hero-specialty cards, and is immune to Blind/Paralysis from spells.
  // Damage from spells and specialties still applies normally.
  "fangarm-nondamage-immunity": {
    id: "fangarm-nondamage-immunity",
    name: "Spell Ward",
    text: "[unit_passive] Ignore all [spell] and Specialty effects other than [damage].",
    effect: { type: "IGNORE_SPELL_AND_SPECIALTY_NONDAMAGE" },
    implementationStatus: "implemented"
  },
  // Tower Genies: dig Spells out of your own deck. Few = other action (discard
  // exactly 3); Pack = after its attack (discard up to 3).
  "genie-spell-draw-few": {
    id: "genie-spell-draw-few",
    name: "Wish",
    text: "[unit_other] Discard 3 cards from your deck and take a Spell discarded this way to your hand.",
    effect: { type: "DECK_DISCARD_TAKE_SPELL", count: 3, trigger: "other-action" },
    implementationStatus: "implemented"
  },
  "genie-spell-draw-pack": {
    id: "genie-spell-draw-pack",
    name: "Wish",
    text: "[unit_attack] Discard up to 3 cards from your deck and take a Spell discarded this way to your hand.",
    effect: { type: "DECK_DISCARD_TAKE_SPELL", count: 3, trigger: "on-attack" },
    implementationStatus: "implemented"
  },
  // Tower Iron Golems (Few) / Rampart Unicorns (Few): self-only −1 spell damage.
  "reduce-spell-damage-1": {
    id: "reduce-spell-damage-1",
    name: "Spell Resistance",
    text: "[unit_passive] Reduce any damage from spells by 1 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE", amount: 1 },
    implementationStatus: "implemented"
  },
  // Rampart Unicorns (Pack): −1 spell damage to itself and adjacent friendly units.
  "unicorn-spell-ward-aura": {
    id: "unicorn-spell-ward-aura",
    name: "Spell Ward",
    text: "[unit_passive] Reduce any damage from spells dealt to this and adjacent friendly unit(s) by 1 (to a minimum of 0).",
    effect: { type: "REDUCE_SPELL_DAMAGE_AURA", amount: 1 },
    implementationStatus: "implemented"
  },
  // Neutral Unicorn (a different printed ability from the Rampart Unicorns): its
  // card prints a Retaliation paralysis rather than spell-damage reduction. Reuses
  // the implemented PARALYZE_ON_RETALIATION effect (automatic, no die — like the
  // Medusas' Pack/neutral gaze).
  "unicorn-paralyze-retaliation": {
    id: "unicorn-paralyze-retaliation",
    name: "Blinding Horn",
    text: "[unit_retaliation] After this unit's Retaliation Attack, the target gains Paralysis (it skips its next activation; any damage clears it).",
    effect: { type: "PARALYZE_ON_RETALIATION" },
    implementationStatus: "implemented"
  },
  // Inferno Efreet (Few): immune to Magic Arrow only (the Pack also resists Fire,
  // which the shared `efreet-fire-immunity` covers).
  "efreet-magic-arrow-immunity": {
    id: "efreet-magic-arrow-immunity",
    name: "Magic Arrow Immunity",
    text: "[unit_passive] Ignores any damage from Magic Arrows.",
    effect: { type: "IMMUNE_TO_SPELL_SCHOOLS", schools: ["any"] },
    implementationStatus: "implemented"
  },
  // Dungeon Minotaurs (Few/Pack): draw a card whenever the attack die resolves "-1".
  "minotaur-draw-on-miss": {
    id: "minotaur-draw-on-miss",
    name: "Bull Resolve",
    text: '[unit_attack] If you resolve a "-1" on the Attack die, draw a card.',
    effect: { type: "ON_ATTACK_DIE_DRAW", onRoll: -1, amount: 1 },
    implementationStatus: "implemented"
  },
  // Tower Magi (Pack): on activation, your first spell this combat round gets +1 power.
  "magi-power-boost": {
    id: "magi-power-boost",
    name: "Mage's Insight",
    text: "[activation] Add +1 power to the first spell you cast this round.",
    effect: { type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST", amount: 1 },
    implementationStatus: "implemented"
  },
  // Conflux Pack Elementals: "[activation] Add +1 power to the first <school>
  // Magic spell you cast during this Activation." Scoped to one Spell school.
  "storm-elemental-air-power": {
    id: "storm-elemental-air-power",
    name: "Storm Surge",
    text: "[activation] Add +1 power to the first Air Magic spell you cast during this Activation.",
    effect: { type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST", amount: 1, school: "air" },
    implementationStatus: "implemented"
  },
  "ice-elemental-water-power": {
    id: "ice-elemental-water-power",
    name: "Frigid Focus",
    text: "[activation] Add +1 power to the first Water Magic spell you cast during this Activation.",
    effect: { type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST", amount: 1, school: "water" },
    implementationStatus: "implemented"
  },
  "energy-elemental-fire-power": {
    id: "energy-elemental-fire-power",
    name: "Searing Focus",
    text: "[activation] Add +1 power to the first Fire Magic spell you cast during this Activation.",
    effect: { type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST", amount: 1, school: "fire" },
    implementationStatus: "implemented"
  },
  "magma-elemental-earth-power": {
    id: "magma-elemental-earth-power",
    name: "Tectonic Focus",
    text: "[activation] Add +1 power to the first Earth Magic spell you cast during this Activation.",
    effect: { type: "ON_ACTIVATION_SPELL_POWER_FIRST_CAST", amount: 1, school: "earth" },
    implementationStatus: "implemented"
  },
  // Cove Nix (Pack): a hard cap on the damage any single attack can deal to it.
  "nix-damage-cap": {
    id: "nix-damage-cap",
    name: "Hardened Shell",
    text: "[unit_passive] This unit cannot take more than 4 damage from a single attack (Spell and ability damage are not capped).",
    effect: { type: "CAP_DAMAGE_PER_ATTACK", amount: 4 },
    implementationStatus: "implemented"
  },
  // Cove Nix (Neutral guard): the same Hardened Shell, but the single-sided
  // Neutral Unit card caps a single attack at 5 instead of the Pack's 4.
  "nix-damage-cap-neutral": {
    id: "nix-damage-cap-neutral",
    name: "Hardened Shell",
    text: "[unit_passive] This unit cannot take more than 5 damage from a single attack (Spell and ability damage are not capped).",
    effect: { type: "CAP_DAMAGE_PER_ATTACK", amount: 5 },
    implementationStatus: "implemented"
  },
  // Fuyuki Casters (Few/Pack): hard cap of 1 damage from each single attack OR
  // Spell hit (stronger than the old Pack-only reduce-spell-damage-1).
  "casters-damage-cap": {
    id: "casters-damage-cap",
    name: "Leyline Barrier",
    text: "[unit_passive] This unit cannot take more than 1 damage from a single attack or Spell.",
    effect: { type: "CAP_DAMAGE_PER_ATTACK", amount: 1, includeSpells: true },
    implementationStatus: "implemented"
  },
  // Cove Haspids (Few): +2 Attack once it has been knocked down from its Pack side this combat.
  "haspid-vengeance": {
    id: "haspid-vengeance",
    name: "Vengeance",
    text: "[unit_attack] +2 Attack if, during this Combat, this unit was flipped from the Pack to the Few side.",
    effect: { type: "ATTACK_BONUS_IF_FLIPPED", amount: 2 },
    implementationStatus: "implemented"
  },
  // Cove Seamen (Pack): once per combat, banking 2 gold for removing a unit from the board.
  "seamen-plunder": {
    id: "seamen-plunder",
    name: "Plunder",
    text: "[unit_passive] Once per Combat, when this unit removes a unit from Combat, gain 2 gold.",
    effect: { type: "ON_KILL_GAIN_RESOURCE", resource: "gold", amount: 2 },
    implementationStatus: "implemented"
  },
  // Cove Ayssids (Pack): a kill lets it pounce on another unit adjacent to it —
  // the Hydra follow-up gated on the original target being removed.
  "ayssid-pounce": {
    id: "ayssid-pounce",
    name: "Killer Instinct",
    text: "[unit_attack] If the target is reduced to 0 Health, after resolving the Retaliation Attack (if applicable), attack another unit adjacent to this unit.",
    effect: { type: "SECOND_ATTACK_ONE_ADJACENT_TO_SELF", requiresTargetRemoved: true },
    implementationStatus: "implemented"
  },

  // Wake of Gods neutral-creature adaptation.
  "wog-fire-shield-1": {
    id: "wog-fire-shield-1",
    name: "Fire Shield",
    text: "[unit_passive] An adjacent attacker takes 1 damage after attacking this unit.",
    effect: { type: "FIRE_SHIELD_DAMAGE", amount: 1 },
    implementationStatus: "implemented"
  },
  "wog-gorynych-sweep": {
    id: "wog-gorynych-sweep",
    name: "Many-Headed Sweep",
    text: "[unit_attack] After the attack, attack every other adjacent enemy with 4 Attack. These attacks do not provoke Retaliation.",
    effect: { type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF", baseAttack: 4 },
    implementationStatus: "implemented"
  },
  "wog-ghost-soul-harvest": {
    id: "wog-ghost-soul-harvest",
    name: "Soul Harvest",
    text: "[unit_attack] After defeating a non-Undead unit, heal all damage and permanently gain +1 Health (maximum +2 per game).",
    effect: { type: "ON_KILL_HEAL_AND_PERMANENT_HEALTH", amount: 1, maxBonus: 2, requiresNonUndead: true },
    implementationStatus: "implemented"
  },
  "wog-air-protection": {
    id: "wog-air-protection",
    name: "Protection from Air",
    text: "[unit_passive] Reduce damage from Air Magic spells by 2.",
    effect: { type: "REDUCE_SPELL_SCHOOL_DAMAGE", school: "air", amount: 2 },
    implementationStatus: "implemented"
  },
  "wog-earth-protection": {
    id: "wog-earth-protection",
    name: "Protection from Earth",
    text: "[unit_passive] Reduce damage from Earth Magic spells by 2.",
    effect: { type: "REDUCE_SPELL_SCHOOL_DAMAGE", school: "earth", amount: 2 },
    implementationStatus: "implemented"
  },
  "wog-fire-protection": {
    id: "wog-fire-protection",
    name: "Protection from Fire",
    text: "[unit_passive] Reduce damage from Fire Magic spells by 2.",
    effect: { type: "REDUCE_SPELL_SCHOOL_DAMAGE", school: "fire", amount: 2 },
    implementationStatus: "implemented"
  },
  "wog-water-protection": {
    id: "wog-water-protection",
    name: "Protection from Water",
    text: "[unit_passive] Reduce damage from Water Magic spells by 2.",
    effect: { type: "REDUCE_SPELL_SCHOOL_DAMAGE", school: "water", amount: 2 },
    implementationStatus: "implemented"
  },
  "wog-war-zealot-mirror": {
    id: "wog-war-zealot-mirror",
    name: "Magic Mirror",
    text: "[unit_passive] This unit has Magic Mirror at all times.",
    effect: { type: "INNATE_MAGIC_MIRROR" },
    implementationStatus: "implemented"
  },
  "wog-no-negative-attack-roll": {
    id: "wog-no-negative-attack-roll",
    name: "Sure Shot",
    text: "[unit_attack] Treat a -1 Attack die result as 0.",
    effect: { type: "MINIMUM_ATTACK_DIE", minimum: 0 },
    implementationStatus: "implemented"
  },
  "wog-werewolf-moon-frenzy": {
    id: "wog-werewolf-moon-frenzy",
    name: "Astrologers' Frenzy",
    text: "[unit_passive] During Astrologers' rounds, +1 Attack and this unit must attack if possible.",
    effect: { type: "ASTROLOGERS_ROUND_FRENZY", attackBonus: 1 },
    implementationStatus: "implemented"
  },
  "wog-werewolf-pack-call": {
    id: "wog-werewolf-pack-call",
    name: "Pack Call",
    text: "[unit_attack] Once per Combat after a kill, summon a temporary weak Werewolf with -1 to every statistic.",
    effect: { type: "ON_KILL_SUMMON_WEAK_COPY", statPenalty: 1, oncePerCombat: true },
    implementationStatus: "implemented"
  },
  // (The former `wog-magic-arrow-attack` DEALS_ELEMENTAL_DAMAGE ability was removed:
  // the Hell Steed is a normal melee attacker that rolls its Attack die and is
  // reduced by Defense, so it must NOT carry the un-rollable elemental attack.)
  "wog-hell-steed-fire-wall": {
    id: "wog-hell-steed-fire-wall",
    name: "Blazing Wake",
    text: "[unit_attack] Place Fire Wall on the target's space.",
    effect: { type: "ON_ATTACK_PLACE_FIRE_WALL", damage: 1 },
    implementationStatus: "implemented"
  },
  "wog-santa-ice-bolt": {
    id: "wog-santa-ice-bolt",
    name: "Ice Bolt Attack",
    text: "[unit_attack] This unit's ranged attack uses Ice Bolt. A melee Retaliation Attack instead rolls the Attack die normally.",
    // rangedOnly: the un-rollable Ice Bolt applies only to a RANGED shot. Forced
    // into a melee Retaliation Attack the Santa Gremlin rolls its Attack die like
    // any shooter fighting in melee (at the ranged-in-melee disadvantage), rather
    // than dealing fixed elemental damage that ignores the die and Defense.
    effect: { type: "DEALS_ELEMENTAL_DAMAGE", rangedOnly: true },
    implementationStatus: "implemented"
  },
  "wog-santa-guard": {
    id: "wog-santa-guard",
    name: "Gremlin Guard",
    text: "[unit_passive] Add a neutral Gremlin guard before Combat.",
    effect: { type: "ADD_NEUTRAL_GUARD", unitDefId: "neutral.gremlins" },
    implementationStatus: "implemented"
  },
  "wog-santa-gift": {
    id: "wog-santa-gift",
    name: "Santa's Gift",
    text: "[map_effect] Defeating this unit in a neutral Combat grants one extra Resource die.",
    effect: { type: "EXTRA_RESOURCE_DIE_ON_NEUTRAL_DEFEAT", count: 1 },
    implementationStatus: "implemented"
  },
  "wog-undead": {
    id: "wog-undead",
    name: "Undead",
    text: "[unit_passive] This unit is Undead.",
    effect: { type: "UNDEAD" },
    implementationStatus: "implemented"
  },
  "wog-dracolich-armor": {
    id: "wog-dracolich-armor",
    name: "Necrotic Armor",
    text: "[unit_passive] When attacked, roll an Attack die; on -1, reduce damage taken by 2.",
    effect: { type: "REDUCE_ATTACK_DAMAGE_ON_DEFENSE_DIE", onRoll: -1, amount: 2 },
    implementationStatus: "implemented"
  },
  "wog-dracolich-death-cloud": {
    id: "wog-dracolich-death-cloud",
    name: "Necrotic Death Cloud",
    text: "[unit_attack] Choose a unit adjacent to the target and attack it with 4 Attack.",
    effect: { type: "SECOND_ATTACK_ADJACENT_TO_TARGET", baseAttack: 4 },
    implementationStatus: "implemented"
  },

  // -------------------------------------------------------------------------
  // WOG Commanders (module content — src/data/commanders.ts is the source of
  // truth for targeting rules and Power scaling; the reducer's
  // "commander-cast" branch resolves each COMMANDER_CAST by commanderSlug).
  // -------------------------------------------------------------------------
  "commander-might-1": {
    id: "commander-might-1",
    name: "Might",
    text: "[unit_passive] When this commander attacks it rolls 1 extra attack die: a \"+1\" face raises the attack (a \"−1\" lowers it by 1, no matter how many).",
    effect: { type: "MIGHT_ATTACK_DICE", dice: 1 },
    implementationStatus: "implemented"
  },
  "commander-might-2": {
    id: "commander-might-2",
    name: "Might",
    text: "[unit_passive] When this commander attacks it rolls 2 extra attack dice: each \"+1\" face raises the attack; at most one \"−1\" counts.",
    effect: { type: "MIGHT_ATTACK_DICE", dice: 2 },
    implementationStatus: "implemented"
  },
  "commander-charge": {
    id: "commander-charge",
    name: "Charge",
    // Shared by WOG commanders AND printed unit sides (anime Sabers / True
    // Inheritors), so the text is unit-neutral.
    text: "[unit_attack] +1 Attack when this unit attacks after moving this activation.",
    effect: { type: "ATTACK_BONUS_AFTER_MOVE", amount: 1 },
    implementationStatus: "implemented"
  },
  "commander-might-3": {
    id: "commander-might-3",
    name: "Might",
    text: "[unit_passive] When this commander attacks it rolls 3 extra attack dice: each \"+1\" face raises the attack; at most one \"−1\" counts.",
    effect: { type: "MIGHT_ATTACK_DICE", dice: 3 },
    implementationStatus: "implemented"
  },
  "commander-defense-token": {
    id: "commander-defense-token",
    name: "Guarded",
    // WOG commander Defense grade II ("+1 def when attacked"): a permanent
    // Defense token (unlike the bank sibling, NOT gated on Stacked). Grade III
    // is a flat Defense 3 with no die and does NOT carry this.
    // Shared by WOG commanders AND printed unit sides (anime Sect Protectors),
    // so the text is unit-neutral.
    text: "[unit_passive] This unit is always treated as if it had a Defense token — it rolls the Defend die when attacked (a \"+1\" face gives +1 Defense).",
    effect: { type: "SELF_DEFENSE_TOKEN" },
    implementationStatus: "implemented"
  },
  // Shared, engine-backed Unit Experience reward families. These are separate
  // ids from printed abilities so the XP board can name and illustrate the
  // veteran training without changing printed unit-card rules.
  "veteran-attack-when-attacking": {
    id: "veteran-attack-when-attacking",
    name: "Aggressive Drill",
    text: "[unit_attack] This unit gains +1 Attack on its own attacks, but not on Retaliation Attacks.",
    effect: { type: "OWN_ATTACK_FLAT_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-retaliation-fury": {
    id: "veteran-retaliation-fury",
    name: "Retaliation Drill",
    text: "[unit_passive] This unit gains +1 Attack on Retaliation Attacks only.",
    effect: { type: "RETALIATION_ATTACK_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-guarded-stance": {
    id: "veteran-guarded-stance",
    name: "Guarded Stance",
    text: "[unit_passive] This unit gains +1 Defense whenever it is attacked.",
    effect: { type: "DEFEND_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-steady-aim": {
    id: "veteran-steady-aim",
    name: "Steady Aim",
    text: "[unit_attack] This unit's Attack die cannot resolve below 0.",
    effect: { type: "MINIMUM_ATTACK_DIE", minimum: 0 },
    implementationStatus: "implemented"
  },
  "veteran-rebirth": {
    id: "veteran-rebirth",
    name: "Veteran Rebirth",
    text: "[unit_passive] Once per Combat when an attack would defeat this unit, it survives at 1 Health.",
    effect: { type: "SELF_REBIRTH_ONCE" },
    implementationStatus: "implemented"
  },
  "veteran-spell-sunder": {
    id: "veteran-spell-sunder",
    name: "Spell Sunder",
    text: "[unit_passive] Whenever an enemy casts a Spell from hand, that enemy discards 1 additional card from hand.",
    effect: { type: "SPELL_CAST_HAND_TAX" },
    implementationStatus: "implemented"
  },
  "veteran-low-roll-insight": {
    id: "veteran-low-roll-insight",
    name: "Adversity's Insight",
    text: "[unit_attack] After this unit's own Attack die resolves −1 or 0, draw 1 card.",
    effect: { type: "ON_ATTACK_DIE_DRAW", minRoll: -1, maxRoll: 0, amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-defense-pierce": {
    id: "veteran-defense-pierce",
    name: "Armor-Piercing Drill",
    text: "[unit_passive] Ignore 1 of the target's Defense on this unit's attacks and Retaliation Attacks (minimum 0).",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-soul-feast": {
    id: "veteran-soul-feast",
    name: "Soul Feast",
    text: "[unit_attack] After this unit's own attack, remove up to 1 damage from it.",
    effect: { type: "ON_ATTACK_HEAL_SELF", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-speed-hunter": {
    id: "veteran-speed-hunter",
    name: "Hunt the Slow",
    text: "[unit_passive] This unit gains +1 Attack against a unit with strictly lower current Initiative.",
    effect: { type: "ATTACK_BONUS_VS_SLOWER_TARGET", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-regeneration-2": {
    id: "veteran-regeneration-2",
    name: "Veteran Regeneration",
    text: "When this unit activates, remove up to 2 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  "veteran-flying-movement": {
    id: "veteran-flying-movement",
    name: "Winged Advance",
    text: "This unit uses Flying movement and may cross units and Combat Obstacles.",
    effect: { type: "GRANT_FLYING_MOVEMENT" },
    implementationStatus: "implemented"
  },
  "veteran-fear-aura": {
    id: "veteran-fear-aura",
    name: "Fear Aura",
    text: "When this unit activates, roll 1 Attack die. On −1, Paralyze one random living enemy unit.",
    effect: { type: "ON_ACTIVATION_ROLL_PARALYZE_RANDOM_ENEMY", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "veteran-layer-draw": {
    id: "veteran-layer-draw",
    name: "Divine Triumph",
    text: "After this unit's attack reduces an enemy side or Stack layer to 0 HP, draw 1 card.",
    effect: { type: "DRAW_ON_DEFEAT_SIDE_OR_LAYER", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-moving-pierce": {
    id: "veteran-moving-pierce",
    name: "Lancer's Momentum",
    text: "After moving, this unit ignores 1 Defense on its next attack that activation.",
    effect: { type: "DEFENSE_REDUCTION_AFTER_MOVE", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-mobility-1": {
    id: "veteran-mobility-1",
    name: "Cavalry Tempo",
    text: "This unit may move 1 additional Combat space.",
    effect: { type: "UNIT_MOVE_RANGE_BONUS", amount: 1 },
    implementationStatus: "implemented"
  },
  "veteran-double-attack": {
    id: "veteran-double-attack",
    name: "Relentless Assault",
    text: "After this unit's first attack, it attacks the same target a second time if the target survives.",
    effect: { type: "DOUBLE_ATTACK", anyRange: true },
    implementationStatus: "implemented"
  },
  // Commander combination skills (COMMANDER_COMBOS in src/data/commanders.ts;
  // one stat of the pair at grade 3 + the other at 2+ puts the id on the
  // commander's combat unit). Skills matching an existing creature mechanic
  // reuse its ability id (ignores-retaliation, unlimited-retaliation,
  // teleport-move, gorgon-death-stare); the rest live here.
  "commander-max-damage": {
    id: "commander-max-damage",
    name: "Mighty Blow",
    text: '[unit_attack] This commander\'s own Attack die always counts as "+1" (maximum damage).',
    effect: { type: "MINIMUM_ATTACK_DIE", minimum: 1 },
    implementationStatus: "implemented"
  },
  "commander-defense-crush": {
    id: "commander-defense-crush",
    name: "Crushing Strike",
    text: "[unit_attack] Decrease the target's defense by 2, to a minimum of 0, for this commander's attacks.",
    effect: { type: "DEFENSE_REDUCTION_ON_ATTACK", amount: 2 },
    implementationStatus: "implemented"
  },
  "commander-fearsome": {
    id: "commander-fearsome",
    name: "Fearsome",
    text: '[unit_attack] On a "-1" on this commander\'s Attack die, the target is frozen by fear — it gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "own", onRoll: -1 },
    implementationStatus: "implemented"
  },
  "commander-strike-all": {
    id: "commander-strike-all",
    name: "Whirlwind Strike",
    text: "[unit_attack] After the attack, this commander attacks every other adjacent enemy with a full separate attack. These extra attacks never provoke Retaliation.",
    effect: { type: "SECOND_ATTACK_ALL_ADJACENT_TO_SELF" },
    implementationStatus: "implemented"
  },
  "commander-fire-shield": {
    id: "commander-fire-shield",
    name: "Fire Shield",
    text: "[unit_passive] An adjacent attacker takes 1 damage after attacking this commander.",
    effect: { type: "FIRE_SHIELD_DAMAGE", amount: 1 },
    implementationStatus: "implemented"
  },
  "commander-block": {
    id: "commander-block",
    name: "Block",
    text: '[unit_passive] When attacked, roll an Attack die; on "-1" the attack\'s damage is fully blocked.',
    effect: { type: "REDUCE_ATTACK_DAMAGE_ON_DEFENSE_DIE", onRoll: -1, amount: 99 },
    implementationStatus: "implemented"
  },
  "commander-double-strike": {
    id: "commander-double-strike",
    name: "Double Strike",
    text: "[unit_attack] After the target retaliates (if it can), this commander attacks it once more. The second attack does not provoke another retaliation.",
    effect: { type: "SECOND_ATTACK_SAME_TARGET_AFTER_RETALIATION" },
    implementationStatus: "implemented"
  },
  "commander-paralyze": {
    id: "commander-paralyze",
    name: "Paralyzing Touch",
    text: '[unit_attack] After the attack, roll 1 Attack die; on a "0" the target gains Paralysis (it skips its next activation; any damage clears it).',
    effect: { type: "PARALYZE_TARGET_ON_DIE", source: "extra", onRoll: 0 },
    implementationStatus: "implemented"
  },
  "commander-regeneration": {
    id: "commander-regeneration",
    name: "Regeneration",
    text: "[unit_passive] When this commander activates, remove up to 2 damage from it.",
    effect: { type: "ON_ACTIVATION_HEAL_SELF", amount: 2 },
    implementationStatus: "implemented"
  },
  "commander-cast-paladin": {
    id: "commander-cast-paladin",
    name: "Cure",
    text: "[activation] Once per combat round: remove 1 damage from a friendly unit (Power 1: also remove its negative tokens and effects; Power 2: remove 2 damage instead). Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-hierophant": {
    id: "commander-cast-hierophant",
    name: "Shield",
    text: "[activation] Once per combat round: a friendly unit gains +1/+2/+3 Defense (Power 0/1/2) against melee attacks this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-temple_guardian": {
    id: "commander-cast-temple_guardian",
    name: "Precision",
    text: "[activation] Once per combat round: a friendly ranged unit gains +1/+2/+3 Attack (Power 0/1/2) and ignores all ranged penalties this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-succubus": {
    id: "commander-cast-succubus",
    name: "Fire Shield",
    text: "[activation] Once per combat round: a friendly unit gains a Fire Shield — Power 0: 1 damage for this round; Power 1: 1 damage for the whole combat; Power 2: 2 damage for two rounds. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-brute": {
    id: "commander-cast-brute",
    name: "Bloodlust",
    text: "[activation] Once per combat round: a friendly melee unit anywhere gains +1/+2/+3 Attack (Power 0/1/2) this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-soul_eater": {
    id: "commander-cast-soul_eater",
    name: "Animate Dead",
    text: "[activation] Once per combat round: remove 2 damage from a friendly bronze unit (Power 1: or silver; Power 2: any tier). Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-ogre_leader": {
    id: "commander-cast-ogre_leader",
    name: "Stone Skin",
    text: "[activation] Once per combat round: a friendly unit gains +1/+2/+3 Defense (Power 0/1/2) against all attacks this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-shaman": {
    id: "commander-cast-shaman",
    name: "Haste",
    text: "[activation] Once per combat round: a friendly unit gains +2/+3/+4 Initiative (Power 0/1/2) and +1 Attack against slower units this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-astral_spirit": {
    id: "commander-cast-astral_spirit",
    name: "Counterstrike",
    text: "[activation] Once per combat round: a friendly bronze unit (Power 1: or silver; Power 2: any tier) may retaliate any number of times this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-belfast": {
    id: "commander-cast-belfast",
    name: "Royal Salvo",
    text: "[activation] Once per combat round: deal 1 damage (Power 2: 2 damage) to an enemy unit — adjacent to the commander at Power 0, anywhere from Power 1. Effect damage: no Retaliation, not reduced by Defense, no per-attack damage caps. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-corsair": {
    id: "commander-cast-corsair",
    name: "Slow",
    text: "[activation] Once per combat round: an enemy unit suffers -2/-3/-4 Initiative (Power 0/1/2) and -1 Attack against faster units this round. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-factory": {
    id: "commander-cast-factory",
    name: "Field Repair",
    text: "[activation] Once per combat round: remove 1 damage from an adjacent friendly mechanical unit (Power 1: 2 damage; Power 2: 2 damage at any range). Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  },
  "commander-cast-bulwark": {
    id: "commander-cast-bulwark",
    name: "Rune Mend",
    text: "[activation] Once per combat round: spend 1/2/2 Runes (Power 0/1/2) to remove 1/2/3 damage from a friendly unit. Does not end the activation.",
    effect: { type: "COMMANDER_CAST" },
    implementationStatus: "implemented"
  }
};

/**
 * Creature Bank cards whose printed `abilityText` describes an effect the
 * engine does NOT (fully) execute. This is the explicit, reviewable registry
 * the project rules (CLAUDE.md) require so a display-only line is a conscious
 * declaration, not something a reader has to reverse-engineer. The key is the
 * underlying neutral unit definition id; the value states exactly what runs.
 *
 * A bank card is listed here when EITHER it has no wired ability at all (its
 * `abilities` array is empty but the text describes an effect) OR it has a
 * wired ability plus an extra clause that is not wired ("partial"). Cards with
 * no printed ability (e.g. the Cyclops Stockpile) are NOT listed — an empty
 * `abilities` array with no `abilityText` is not a stub.
 */
export const DISPLAY_ONLY_BANK_ABILITIES: Record<string, string> = {
  // Empty: every Creature Bank card's printed ability is now engine-wired.
  // The former hold-outs are all implemented and covered by a test that fails if
  // the logic is removed (src/engine/creature-bank-abilities.test.ts):
  //   - Imp Cache Familiars  -> bank-familiar-power-drain (while Stacked)
  //   - Crypt/Shipwreck Wraiths -> bank-wraith-attack-discard (on attack)
  //   - Dwarven Treasury Dwarves / Dragon Utopia Crystal Dragons
  //       -> bank-stacked-defense-token (while Stacked)
  //   - Dragon Utopia Black Dragons -> bank-black-dragon-stacked-attack (while Stacked)
  //   - Dragon Utopia Faerie Dragons -> bank-faerie-dragon-spell-lock (while Stacked)
  //   - Medusa Stores Medusas -> bank-medusa-paralyze-stacked (while Stacked, on attack)
  // Keep this registry as the explicit home for any FUTURE display-only bank
  // clause: a stub must be a conscious entry here, never undeclared text.
};

/**
 * The general display-only registry required by CLAUDE.md rule #2/#3: any unit
 * side (few / pack / neutral, across every faction and the neutral decks) whose
 * printed `abilityText` describes an effect the engine does NOT (fully)
 * execute. The key is `"<unitDefId>#<side>"`; the value states exactly what
 * runs (and what does not) so a stub is a conscious, reviewable declaration.
 *
 * A side belongs here when EITHER nothing is wired at all (abilities: [] with
 * effect-describing abilityText) OR a clause of its text goes beyond what its
 * wired abilities do ("partial"). Enforced by
 * src/data/factions/ability-text-enforcement.test.ts: a side with
 * effect-describing text, no wired ability and no entry here (or in
 * ENGINE_RULE_WIRED_ABILITY_TEXT below) fails CI.
 *
 * (This registry replaces the former DISPLAY_ONLY_NEUTRAL_ABILITIES, which
 * covered only single-sided neutral cards and was empty.)
 */
export const DISPLAY_ONLY_ABILITIES: Record<string, string> = {
  // Empty: every unit side's printed ability is currently either wired via its
  // `abilities` tags or declared in ENGINE_RULE_WIRED_ABILITY_TEXT below.
  // Keep this registry as the explicit home for any FUTURE display-only
  // clause: a stub must be a conscious entry here, never undeclared text.
};

/**
 * Unit sides whose printed `abilityText` IS engine-enforced, but through a
 * dedicated game rule keyed off the unit definition rather than an `abilities`
 * tag. NOT stubs — each value must name where the rule runs and the test that
 * fails if it is removed. Anything listed here with a wired `abilities` array
 * or without effect-describing text is stale and fails the enforcement test.
 */
export const ENGINE_RULE_WIRED_ABILITY_TEXT: Record<string, string> = {
  "neutral.skeletons#neutral":
    "Necropolis-only free bronze reinforce after defeating the Skeleton guard — runs via " +
    "combat.skeletonGuardDefeated + openSkeletonReinforceChoice/queueSkeletonReinforce " +
    "(adventure-reducer.ts), including the killed-last fallback at combat end; tested in " +
    "neutral-abilities-batch2.test.ts (mid-combat pop-up) and necromancy.test.ts (ordering)."
};
