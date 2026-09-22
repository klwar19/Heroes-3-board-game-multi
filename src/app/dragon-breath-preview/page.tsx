"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FxStage, type FxCue } from "@/components/table/fx";
import { assetUrl } from "@/lib/asset-url";

type Direction = "right" | "left" | "diagonal";
type Attacker = "black" | "gold" | "gorgon" | "efreet" | "fire" | "faerie";

const attackers: Record<Attacker, { name: string; image: string; fxKey: string }> = {
  black: { name: "Black Dragon", image: "/assets/units-dungeon-golden-black_dragons-pack.webp", fxKey: "dragon-fierce-breath-animated" },
  gold: { name: "Gold Dragon", image: "/assets/units-rampart-golden-gold_dragons-pack.webp", fxKey: "dragon-fire-breath-animated" },
  gorgon: { name: "Gorgon", image: "/assets/units-fortress-silver-gorgons-pack.webp", fxKey: "dragon-fire-breath-animated" },
  efreet: { name: "Efreet", image: "/assets/units-inferno-golden-efreet-pack.webp", fxKey: "dragon-small-breath-animated" },
  fire: { name: "Fire Elemental", image: "/assets/units-conflux-bronze-fire_elementals-pack.webp", fxKey: "dragon-small-breath-animated" },
  faerie: { name: "Faerie Dragon", image: "/assets/units-neutral-azure-faerie_dragons.webp", fxKey: "faerie-rainbow-breath-animated" },
};

const positions: Record<Direction, { dragon: number; target: number }> = {
  right: { dragon: 6, target: 8 },
  left: { dragon: 8, target: 6 },
  diagonal: { dragon: 6, target: 13 },
};

/** Visual-only stage using the game's real board art, card art and FxStage. */
export default function DragonBreathPreview() {
  const [direction, setDirection] = useState<Direction>("right");
  const [attacker, setAttacker] = useState<Attacker>("black");
  const [cues, setCues] = useState<FxCue[]>([]);
  const serial = useRef(0);
  const play = useCallback(() => {
    const id = `dragon-breath-preview-${++serial.current}`;
    setCues((current) => [...current, {
      kind: "slash", id,
      fxKey: attackers[attacker].fxKey,
      from: "unit:dragon", at: "unit:target",
    }]);
  }, [attacker]);

  useEffect(() => {
    const first = window.setTimeout(play, 600);
    const repeat = window.setInterval(play, 1900);
    return () => { window.clearTimeout(first); window.clearInterval(repeat); };
  }, [play, direction]);

  const pos = positions[direction];
  return (
    <main style={{ minHeight: "100vh", background: "#140f0a", color: "#f4dfad", padding: "24px 20px", fontFamily: "Georgia, serif" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 8px", fontSize: 25 }}>Dragon Breath · Battle View</h1>
        <p style={{ margin: "0 0 18px", color: "#d1bd94", fontFamily: "Arial, sans-serif", fontSize: 14 }}>
          The game’s actual effect renderer, board art, unit cards and sound. Choose an angle or replay the strike.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18, fontFamily: "Arial, sans-serif" }}>
          {(["right", "left", "diagonal"] as const).map((value) => (
            <button key={value} type="button" onClick={() => setDirection(value)}
              style={{ padding: "9px 14px", borderRadius: 6, border: "1px solid #9c7641", background: direction === value ? "#765126" : "#302219", color: "#fff0ca", cursor: "pointer" }}>
              {value === "diagonal" ? "Diagonal" : `Fire ${value}`}
            </button>
          ))}
          {(Object.keys(attackers) as Attacker[]).map((value) => (
            <button key={value} type="button" onClick={() => setAttacker(value)}
              style={{ padding: "9px 14px", borderRadius: 6, border: "1px solid #9c7641", background: attacker === value ? "#765126" : "#302219", color: "#fff0ca", cursor: "pointer" }}>
              {attackers[value].name}
            </button>
          ))}
          <button type="button" onClick={play}
            style={{ padding: "9px 14px", borderRadius: 6, border: "1px solid #d9a64f", background: "#8b3e17", color: "white", cursor: "pointer" }}>
            Replay
          </button>
        </div>
        <div className="battlefieldFrame" style={{ margin: "0 auto" }}>
          <div className="battlefield" style={{ backgroundImage: `url(${assetUrl("/assets/board/battlefield-4x5-grass-dirt.webp")})`, backgroundSize: "100% 100%" }}>
            {Array.from({ length: 20 }, (_, index) => {
              const dragon = index === pos.dragon;
              const target = index === pos.target;
              return (
                <div key={index} data-fx-cell={index} data-fx-unit={dragon ? "dragon" : target ? "target" : undefined}
                  style={{ position: "relative", display: "grid", placeItems: "center", border: "1px solid rgba(241,214,155,.18)", zIndex: dragon || target ? 1 : 0 }}>
                  {(dragon || target) && (
                    <div className="boardCard" style={{ width: "70%" }}>
                      <img className="boardCardImage" alt={dragon ? attackers[attacker].name : "Phoenix"}
                        src={assetUrl(dragon ? attackers[attacker].image : "/assets/units-conflux-golden-phoenixes-pack.webp")} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p style={{ fontFamily: "Arial, sans-serif", fontSize: 12, color: "#b6a37f", marginTop: 12 }}>
          Visual preview only; no combat action or damage is resolved on this page.
        </p>
      </div>
      <FxStage cues={cues} onDone={(id) => setCues((current) => current.filter((cue) => cue.id !== id))} />
    </main>
  );
}
