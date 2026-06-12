"use client";

/* eslint-disable @next/next/no-img-element */

import { cardLibrary } from "@/data/cards/library";
import { coreFactionDefinitions, coreHeroDefinitions } from "@/data/factions/core";
import {
  EXPERT_USES_BY_LEVEL,
  HAND_LIMIT_BY_LEVEL,
  MAX_EXPERIENCE,
  SPECIALTY_LEVELS,
  effectiveHandLimit,
  getMainHero,
  type GameState,
  type PlayerId
} from "@/engine";
import { useCardZoom } from "@/components/table/zoom";

const ROMAN = ["", "Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ", "Ⅵ", "Ⅶ"];
/** Specialty cards sit at Ⅰ (starting deck), Ⅳ and Ⅵ — the laurelled numerals. */
const SPECIALTY_TRACK_LEVELS = [1, ...SPECIALTY_LEVELS] as number[];

/** Faction palettes sampled from the printed hero board scans. */
const BOARD_THEMES: Record<string, { banner: string; edge: string }> = {
  castle: { banner: "linear-gradient(180deg, #3a74c4 0%, #1d4a8a 100%)", edge: "#3f6fb5" },
  rampart: { banner: "linear-gradient(180deg, #379a46 0%, #1c6228 100%)", edge: "#3f9e4d" },
  inferno: { banner: "linear-gradient(180deg, #ab2a1c 0%, #6e150b 100%)", edge: "#b03a26" },
  necropolis: { banner: "linear-gradient(180deg, #27796b 0%, #154c44 100%)", edge: "#2e7a6e" },
  dungeon: { banner: "linear-gradient(180deg, #6b48b8 0%, #3d2769 100%)", edge: "#7a55c0" }
};

// ---------------------------------------------------------------------------
// Printed-board iconography (statistics, crowns, hand-limit cards, laurels…)
// ---------------------------------------------------------------------------

function AttackIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeLinecap="round">
        <path d="M5 3.4 L17.4 15.8" strokeWidth="2.6" />
        <path d="M19 3.4 L6.6 15.8" strokeWidth="2.6" />
        <path d="M14.9 18.1 L19.7 13.3 M17.4 15.8 L19.6 19.6" strokeWidth="1.7" />
        <path d="M9.1 18.1 L4.3 13.3 M6.6 15.8 L4.4 19.6" strokeWidth="1.7" />
      </g>
      <circle cx="20.3" cy="20.5" fill="currentColor" r="1.4" />
      <circle cx="3.7" cy="20.5" fill="currentColor" r="1.4" />
    </svg>
  );
}

function DefenseIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <path
        d="M12 2.2 C14.4 4.1 17.3 5 20.2 5.2 C20.2 11.2 17.6 17.4 12 21.8 C6.4 17.4 3.8 11.2 3.8 5.2 C6.7 5 9.6 4.1 12 2.2 Z"
        fill="currentColor"
      />
      <path d="M12 3.6 V20.4 M4.6 9.4 H19.4" fill="none" stroke="var(--hb-slate)" strokeWidth="1.4" />
    </svg>
  );
}

function PowerIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <path d="M12 7.4 l.8 1.8 1.8.8 -1.8.8 -.8 1.8 -.8-1.8 -1.8-.8 1.8-.8 Z" fill="currentColor" />
      <path d="M5.6 2.6 l.6 1.4 1.4.6 -1.4.6 -.6 1.4 -.6-1.4 -1.4-.6 1.4-.6 Z" fill="currentColor" />
      <path d="M18.4 2.6 l.6 1.4 1.4.6 -1.4.6 -.6 1.4 -.6-1.4 -1.4-.6 1.4-.6 Z" fill="currentColor" />
      <path d="M11.4 1 l.6 1.3 1.3.6 -1.3.6 -.6 1.3 -.6-1.3 -1.3-.6 1.3-.6 Z" fill="currentColor" />
      <path
        d="M2.6 10.4 C5.6 9 8.9 9.1 12 11 C15.1 9.1 18.4 9 21.4 10.4 V20.4 C18.4 19.1 15.2 19.2 12 21 C8.8 19.2 5.6 19.1 2.6 20.4 Z"
        fill="currentColor"
      />
      <path d="M12 11.4 V20.4" fill="none" stroke="var(--hb-slate)" strokeWidth="1.2" />
    </svg>
  );
}

function KnowledgeIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <rect fill="currentColor" height="15" rx="0.8" width="4.6" x="3.4" y="6" />
      <rect fill="currentColor" height="17" rx="0.8" width="4.6" x="9.7" y="4" />
      <rect fill="currentColor" height="14" rx="0.8" transform="rotate(8 18.3 14)" width="4.6" x="16" y="7" />
      <path d="M4.2 9 h3 M10.5 7 h3 M17.4 10.4 l2.9.4" fill="none" stroke="var(--hb-slate)" strokeWidth="1.1" />
    </svg>
  );
}

function CrownIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <path d="M3.4 16.6 L4.6 7.8 L8.8 11.6 L12 5.4 L15.2 11.6 L19.4 7.8 L20.6 16.6 Z" fill="currentColor" />
      <rect fill="currentColor" height="2" rx="0.6" width="17.2" x="3.4" y="17.6" />
    </svg>
  );
}

function HandCardsIcon() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <rect fill="currentColor" height="14.5" rx="1.6" transform="rotate(-10 9.5 11.5)" width="9.6" x="4.7" y="4.2" />
      <rect
        fill="currentColor"
        height="14.5"
        rx="1.6"
        stroke="var(--hb-slate)"
        strokeWidth="1"
        transform="rotate(9 14.5 12.5)"
        width="9.6"
        x="9.7"
        y="5.2"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg aria-hidden="true" className="hbIcon" viewBox="0 0 24 24">
      <circle cx="10.4" cy="10.4" fill="none" r="5.6" stroke="currentColor" strokeWidth="2.1" />
      <path d="M14.6 14.6 L19.6 19.6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.6" />
    </svg>
  );
}

/** One laurel sprig; mirrored with CSS for the right-hand side. */
function LaurelIcon() {
  return (
    <svg aria-hidden="true" className="hbLaurel" viewBox="0 0 10 18">
      <path d="M8.6 1.6 C5 5 3.4 9.4 4.8 16.2" fill="none" stroke="currentColor" strokeWidth="1" />
      <path d="M7.9 3.4 C6.3 2.7 4.9 3 3.8 4.2 C5.4 5 6.9 4.8 7.9 3.4 Z" fill="currentColor" />
      <path d="M6 7.2 C4.5 6.7 3.1 7.2 2.2 8.5 C3.9 9.1 5.3 8.7 6 7.2 Z" fill="currentColor" />
      <path d="M5 11.4 C3.6 11.1 2.3 11.7 1.6 13.1 C3.3 13.5 4.6 12.9 5 11.4 Z" fill="currentColor" />
    </svg>
  );
}

/** Spear divider between the level-track columns, as printed. */
function SpearIcon({ flip }: { flip: boolean }) {
  return (
    <svg aria-hidden="true" className="hbSpear" style={flip ? { transform: "scaleX(-1)" } : undefined} viewBox="0 0 16 16">
      <path d="M3 13 L11.4 4.6" stroke="currentColor" strokeLinecap="round" strokeWidth="1.2" />
      <path d="M10 2 C12 2.4 13.6 4 14 6 C12 5.6 10.4 4 10 2 Z" fill="currentColor" />
    </svg>
  );
}

/** Might heroes wear the horned helmet, magic heroes the wizard hat. */
function TypeEmblem({ type }: { type: "might" | "magic" }) {
  if (type === "might") {
    return (
      <svg aria-hidden="true" className="hbEmblem" viewBox="0 0 24 24">
        <path d="M7.4 14.6 C7.4 9.4 9.2 6.6 12 6.6 C14.8 6.6 16.6 9.4 16.6 14.6 L16.6 17 L7.4 17 Z" fill="currentColor" />
        <path d="M7.6 13.4 C4.6 12.6 2.9 10.2 2.7 6.6 C5.8 7.4 7.6 9.6 8.2 12.6 Z" fill="currentColor" />
        <path d="M16.4 13.4 C19.4 12.6 21.1 10.2 21.3 6.6 C18.2 7.4 16.4 9.6 15.8 12.6 Z" fill="currentColor" />
        <rect fill="currentColor" height="1.6" rx="0.8" width="11.6" x="6.2" y="17.8" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="hbEmblem" viewBox="0 0 24 24">
      <path d="M3.4 17.2 C8 16 16 16 20.6 17.2 C16.4 19.2 7.6 19.2 3.4 17.2 Z" fill="currentColor" />
      <path d="M9 16.6 C9.6 11.6 11.2 7.4 15.4 3.6 C14.2 8.6 14 12.9 15.2 16.8 Z" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Card-art crops: every ability/specialty card prints its art top-center, so
// a fixed window over the scan recovers the same art the board shows.
// ---------------------------------------------------------------------------

function CardArt({ cardId, kind }: { cardId?: string; kind: "ability" | "specialty" }) {
  const card = cardId ? cardLibrary[cardId] : undefined;
  const image = card?.assets?.cardImage;
  if (!image) {
    return <div className={`hbArt hbArt-${kind} hbArtEmpty`} />;
  }

  return (
    <div className={`hbArt hbArt-${kind}`}>
      <img alt="" src={image} />
    </div>
  );
}

function specialtyDisplayName(cardId: string): string {
  const name = cardLibrary[cardId]?.name ?? cardId;
  return name.replace(/\s+(Ⅰ|Ⅳ|Ⅵ|I|IV|VI)$/u, "");
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

/**
 * The printed hero board: portrait and name banner, the four starting
 * statistics, starting ability and specialty, and the Ⅰ–Ⅶ level track with
 * hand-limit cards, expert crowns and ability searches. Live state on top:
 * the XP cube sits on the current level and gained specialties fill their
 * laurelled slots. Click the banner for the printed scan, the ability or any
 * specialty for the full card.
 */
export function HeroBoard({ state, playerId }: { state: GameState; playerId: PlayerId }) {
  const { zoomCard, zoomContent } = useCardZoom();
  const player = state.players[playerId];
  const hero = getMainHero(state, playerId);
  const heroDef = player?.heroDefId ? coreHeroDefinitions[player.heroDefId] : undefined;
  if (!player || !hero || !heroDef) {
    return null;
  }

  const faction = coreFactionDefinitions[heroDef.faction];
  const theme = BOARD_THEMES[heroDef.faction] ?? BOARD_THEMES.castle;
  const ability = cardLibrary[heroDef.startingAbilityCardId];
  const gainedSpecialtyLevels = SPECIALTY_TRACK_LEVELS.filter((level) => hero.level >= level);
  const currentSpecialtyLevel = gainedSpecialtyLevels.at(-1) ?? 1;
  const currentSpecialtyId = heroDef.specialtyCardIds[currentSpecialtyLevel as 1 | 4 | 6];
  const handLimit = effectiveHandLimit(state, playerId);

  const stats = [
    { label: "Attack", value: heroDef.startingStats.attack, icon: <AttackIcon /> },
    { label: "Defense", value: heroDef.startingStats.defense, icon: <DefenseIcon /> },
    { label: "Power", value: heroDef.startingStats.power, icon: <PowerIcon /> },
    { label: "Knowledge", value: heroDef.startingStats.knowledge, icon: <KnowledgeIcon /> }
  ];

  return (
    <div className="hbWrap">
      <section
        aria-label={`${heroDef.name} hero board`}
        className="hb"
        style={{ "--hb-banner": theme.banner, "--hb-edge": theme.edge, "--hb-cube": faction?.color } as React.CSSProperties}
      >
        <div className="hbTop">
          <div className="hbPortrait">
            {heroDef.portrait ? <img alt={`${heroDef.name} portrait`} src={heroDef.portrait} /> : null}
          </div>
          <div className="hbRight">
            <button
              className="hbBanner"
              onClick={() =>
                heroDef.boardScan
                  ? zoomContent({
                      title: `${heroDef.name} — printed hero board`,
                      image: heroDef.boardScan,
                      subtitle: `${heroDef.class} · ${faction?.name ?? heroDef.faction}`,
                      lines: ["Fan wiki scan of the physical board."]
                    })
                  : undefined
              }
              title="View the printed board scan"
              type="button"
            >
              <span className="hbName">{heroDef.name}</span>
              <span className="hbClass">{heroDef.class}</span>
              <TypeEmblem type={heroDef.type} />
            </button>
            <div className="hbStats" title="Statistic cards in the starting deck">
              {stats.map((stat) => (
                <div className="hbStat" key={stat.label} title={`${stat.label} ${stat.value}`}>
                  {stat.icon}
                  <b>{stat.value}</b>
                </div>
              ))}
            </div>
            <div className="hbLoadout">
              <button
                className="hbAbility"
                onClick={() => zoomCard(heroDef.startingAbilityCardId)}
                title={`Starting ability: ${ability?.name ?? heroDef.startingAbilityCardId}`}
                type="button"
              >
                <span className="hbPanelLabel">{ability?.name ?? "Ability"}</span>
                <CardArt cardId={heroDef.startingAbilityCardId} kind="ability" />
              </button>
              <button
                className="hbSpecialty"
                onClick={() => (currentSpecialtyId ? zoomCard(currentSpecialtyId) : undefined)}
                title="Current specialty card"
                type="button"
              >
                <span className="hbPanelLabel">Specialty</span>
                <CardArt cardId={currentSpecialtyId} kind="specialty" />
                <span className="hbSpecName">{currentSpecialtyId ? specialtyDisplayName(currentSpecialtyId) : "—"}</span>
              </button>
            </div>
          </div>
        </div>

        <div aria-label={`Level track: level ${hero.level}, ${hero.experience}/${MAX_EXPERIENCE} experience`} className="hbTrack">
          {[1, 2, 3, 4, 5, 6, 7].map((level) => {
            const reached = hero.level >= level;
            const specialty = SPECIALTY_TRACK_LEVELS.includes(level);
            const specialtyCardId = specialty ? heroDef.specialtyCardIds[level as 1 | 4 | 6] : undefined;
            const handGain = HAND_LIMIT_BY_LEVEL[level] !== HAND_LIMIT_BY_LEVEL[level - 1] || level === 1;
            const crowns = EXPERT_USES_BY_LEVEL[level] - (EXPERT_USES_BY_LEVEL[level - 1] ?? 0) > 0 ? EXPERT_USES_BY_LEVEL[level] : 0;

            return (
              <div className={`hbLevel ${reached ? "reached" : ""} ${hero.level === level ? "current" : ""}`} key={level}>
                {level > 1 ? <SpearIcon flip={level % 2 === 0} /> : null}
                <span className={`hbNumeral ${specialty ? "gold" : "silver"}`}>
                  {specialty ? <LaurelIcon /> : null}
                  {ROMAN[level]}
                  {specialty ? <LaurelIcon /> : null}
                </span>
                <div className="hbSlotCell">
                  {specialty && specialtyCardId ? (
                    <button
                      className={`hbSlot hbSlotSpecialty ${reached ? "gained" : ""}`}
                      disabled={!reached}
                      onClick={() => zoomCard(specialtyCardId)}
                      title={
                        reached
                          ? `${specialtyDisplayName(specialtyCardId)} (level ${ROMAN[level]} specialty)`
                          : `Specialty card gained at level ${ROMAN[level]}`
                      }
                      type="button"
                    >
                      {reached ? <CardArt cardId={specialtyCardId} kind="specialty" /> : null}
                    </button>
                  ) : (
                    <div className="hbSlot hbSlotSearch" title={`Level ${ROMAN[level]}: Search (2) the Ability deck`}>
                      <SearchGlyph />
                    </div>
                  )}
                  {hero.level === level ? (
                    <span className="hbCube" title={`Experience ${hero.experience}/${MAX_EXPERIENCE}`} />
                  ) : null}
                </div>
                <div className="hbGain">
                  {handGain ? (
                    <span className="hbHandGain">
                      <HandCardsIcon />
                      <b>{HAND_LIMIT_BY_LEVEL[level]}</b>
                    </span>
                  ) : null}
                  {crowns > 0 ? (
                    <span className={`hbCrowns hbCrowns${crowns}`}>
                      {Array.from({ length: crowns }, (_, i) => (
                        <CrownIcon key={i} />
                      ))}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <footer className="hbFooter">
          <span>
            Level {ROMAN[hero.level]} · XP {hero.experience}/{MAX_EXPERIENCE}
          </span>
          <span>
            Hand {handLimit} · Crowns {player.limits.expertUses}
          </span>
        </footer>
      </section>
    </div>
  );
}
