"use client";

// Dev-only preview of the ORNATE DRAGON chrome (same precedent as
// /spell-book-preview): reproduces the adventure map screen's DOM classes
// with mock content so the dragon's claw grips (card bar), head (map felt)
// and tail coil (left rail) — plus the combat shelf's wrapping vine via
// ?combat=1 — can be checked without a live game.
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function MockCard({ label }: { label: string }) {
  return (
    <div
      style={{
        width: 108,
        height: 148,
        borderRadius: 10,
        border: "1px solid rgba(213,168,79,0.55)",
        background: "linear-gradient(180deg, #3a2b18, #241a0e)",
        color: "#e8d5a2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        flex: "0 0 auto"
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

      <div className="playerCardBar" style={{ order: 3, display: "flex", gap: 12, padding: "9px 12px" }}>
        <div className="ownDeckColumn" style={{ display: "flex", gap: 8 }}>
          <MockCard label="Deck" />
          <MockCard label="Discard" />
        </div>
        <div className="handArea" style={{ display: "flex", gap: 8 }}>
          {["Marksmen", "Griffins", "Magic Arrow", "Tactics", "Gold"].map((label) => (
            <MockCard key={label} label={label} />
          ))}
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

      <div className="advDecksBottom" style={{ order: 5 }}>
        <div className="advDecks" style={{ display: "flex", gap: 10, padding: 10 }}>
          {["Spells", "Neutrals", "Artifacts"].map((label) => (
            <MockCard key={label} label={label} />
          ))}
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
