import { CommanderCard } from "@/components/commander-card";
import { COMMANDER_SLUGS, commanderDefinitions } from "@/data/commanders";

// Dev preview: all 12 Wake of Gods Commander cards with DYNAMIC stats — the
// numbers are overlaid from the grade tables (1..3 per stat), never baked into
// the art. Click the grade pips on any card to preview a configuration (Power
// tier highlighting, Might/Ward chips, combos) exactly as the in-game card
// renders it from engine state. Open /commander-preview with `npm run dev`.

export default function CommanderPreviewPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 24, background: "#181410", color: "#e8ddc6" }}>
      <h1 style={{ fontFamily: '"Times New Roman", serif', color: "#f4d774", margin: 0 }}>
        Wake of Gods — Commander cards ({COMMANDER_SLUGS.length})
      </h1>
      <p style={{ maxWidth: "78ch", opacity: 0.85 }}>
        Every commander starts at <strong>Attack 2 / Defense 1 / Health 4 / Speed 5</strong>, Might +0 and Power 0 —
        all six stats at grade 1. At hero level 3 and 6 (the Paladin&apos;s Wise: 2 and 5) the owner raises two
        different stats one grade each. Click the <em>grade pips</em> below any card to preview a build: the stat
        wells, the Might/Power chips, the command-ability tier and the grade-3 combos all update live, exactly as the
        in-game card renders engine state.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          gap: 28,
          marginTop: 20,
          alignItems: "start"
        }}
      >
        {COMMANDER_SLUGS.map((slug) => (
          <div key={slug}>
            <CommanderCard editable slug={slug} />
            <div style={{ textAlign: "center", fontSize: 12, opacity: 0.6, marginTop: 6 }}>
              {commanderDefinitions[slug].faction}
              {commanderDefinitions[slug].original ? " · original" : ""}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
