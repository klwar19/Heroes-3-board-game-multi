"use client";

// Dev-only preview of the map card tray layout:
// LEFT deck/discard/spell box · RIGHT permanents-on-top + hand box.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { AzureClawChill } from "@/components/adventure/azure-claw-chill";

function MockCard({ label, w = 108, h = 148 }: { label: string; w?: number; h?: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 10,
        border: "1px solid rgba(213,168,79,0.55)",
        background: "linear-gradient(180deg, #3a2b18, #241a0e)",
        color: "#e8d5a2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        flex: "0 0 auto",
        textAlign: "center",
        padding: 4
      }}
    >
      {label}
    </div>
  );
}

function CombatTrayPreview() {
  return (
    <main style={{ minHeight: "100vh", background: "#151016", display: "grid", alignContent: "end", padding: 24 }}>
      <div className="handFan" style={{ display: "flex", gap: 10, justifyContent: "center", paddingBottom: 12 }}>
        {["Bless", "Fireball", "Shield", "Haste"].map((label) => (
          <MockCard key={label} label={label} />
        ))}
      </div>
    </main>
  );
}

function MapScreenPreview() {
  return (
    <main
      className="tableRoot adventureRoot"
      style={{ display: "flex", flexDirection: "column", minHeight: "100vh", padding: 8 }}
    >
      <div className="tableTopRow" style={{ order: 1 }}>
        <div className="advHud">
          <div className="advHudCell">
            <strong>Round 3</strong>
            <small>resource round</small>
          </div>
          <div className="advHudCell resources">
            <strong>14 gold · 4 wood · 3 ore</strong>
            <small>income +3</small>
          </div>
          <div className="advHudCell">
            <strong>Movement 4</strong>
            <small>main hero</small>
          </div>
        </div>
      </div>

      <div
        className="adventureHand playerCardBar"
        style={{ order: 3, position: "relative", minHeight: 200, marginTop: 40 }}
      >
        {/* LEFT: deck + discard + spell book */}
        <div className="ownDeckColumn">
          <div className="ownDeckToolsRow">
            <div className="ownDeckPile" aria-label="Your deck and discard">
              <div className="ownDeckSpot">
                <MockCard label="Deck 12" w={72} h={100} />
                <small>Deck</small>
              </div>
              <div className="ownDiscardSpot" style={{ width: 72, height: 100 }}>
                <span className="ownDeckCount">3</span>
                <small>Discard</small>
              </div>
            </div>
            <div className="spellBookPanel">
              <button className="spellBookToggle" type="button">
                <span className="spellBookCount">2</span>
                <small>Spell Book</small>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: permanents on top, hand below */}
        <div className="handMain">
          <div className="permanentEffectsPanel">
            <div className="trayBoxHeader">
              <strong>Permanents &amp; Ongoing</strong>
            </div>
            <div className="permanentRow" aria-label="Permanents and ongoing in play">
              {[
                {
                  name: "Ballista",
                  text: "At the start of each Combat round, deal 1 damage to an enemy unit",
                  kind: "permanent" as const
                },
                {
                  name: "Eversmoking Ring",
                  text: "Gain 1 valuables at the start of each Resources round",
                  kind: "permanent" as const
                },
                {
                  name: "Cart of Lumber",
                  text: "Gain 1 wood at the start of each Resources round",
                  kind: "permanent" as const
                },
                {
                  name: "Bless",
                  text: "Until the effect ends → then discard",
                  kind: "ongoing" as const
                },
                {
                  name: "Shield",
                  text: "Until the end of Combat → then discard",
                  kind: "ongoing" as const
                },
                {
                  name: "Haste",
                  text: "Until the effect ends → then hand (recalled)",
                  kind: "ongoing" as const
                }
              ].map((p) => (
                <div
                  className={`permanentSlot ${p.kind === "ongoing" ? "ongoing" : ""}`}
                  key={`${p.kind}-${p.name}`}
                >
                  <div
                    className="permanentCardImage"
                    style={{
                      width: 52,
                      height: 72,
                      borderRadius: 6,
                      border: "1px solid rgba(213,168,79,0.55)",
                      background:
                        p.kind === "ongoing"
                          ? "linear-gradient(180deg, #2a3a48, #152028)"
                          : "linear-gradient(180deg, #3a2b18, #241a0e)",
                      color: "#e8d5a2",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 9,
                      textAlign: "center",
                      padding: 3,
                      flex: "0 0 auto"
                    }}
                  >
                    {p.name.split(" ")[0]}
                  </div>
                  <div className="permanentMeta">
                    <span className={`permanentBadge ${p.kind === "ongoing" ? "ongoingBadge" : ""}`}>
                      {p.kind === "ongoing" ? "ongoing" : "permanent"}
                    </span>
                    <strong>{p.name}</strong>
                    <small>{p.text}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="handArea">
            <div className="handTopBar">
              <small>Hand 5/5</small>
            </div>
            <div className="adventureHandCards" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["Marksmen", "Griffins", "Magic Arrow", "Tactics", "Gold"].map((label) => (
                <MockCard key={label} label={label} />
              ))}
            </div>
          </div>
        </div>
        <AzureClawChill />
        <div aria-hidden className="trayFootFrost">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" draggable={false} src="/assets/ui/ornate/tray-foot-frost.webp" />
        </div>
      </div>

      <div className="adventureMidRow" style={{ order: 4, flex: 1 }}>
        <div className="leftRail">
          <div className="leftRailDock" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {["Town — Castle", "Hero — Sir Christian", "Unit deck"].map((label) => (
              <div
                className="dockTile"
                key={label}
                style={{
                  minHeight: 86,
                  borderRadius: 12,
                  border: "1px solid rgba(213,168,79,0.4)",
                  background: "linear-gradient(180deg, rgba(30,21,11,0.9), rgba(20,14,8,0.94))",
                  color: "#e8d5a2",
                  display: "flex",
                  alignItems: "center",
                  padding: "10px 12px",
                  fontSize: 13
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="mapColumn">
          <div className="mapStage">
            <div className="hexMapWrap" />
          </div>
        </div>
      </div>
    </main>
  );
}

function DragonPreviewInner() {
  const params = useSearchParams();
  return params.get("combat") ? <CombatTrayPreview /> : <MapScreenPreview />;
}

export default function DragonPreviewPage() {
  return (
    <Suspense fallback={null}>
      <DragonPreviewInner />
    </Suspense>
  );
}
