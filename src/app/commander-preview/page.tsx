import { CommanderCard } from "@/components/commander-card";
import { COMMANDER_SLUGS, commanderDefinitions } from "@/data/commanders";

// Dev preview: all 12 Wake of Gods Commander cards, each with DYNAMIC upgradeable
// stat numbers overlaid on the built frame and a click-to-open "Upgrades & Skills"
// growth panel. Open /commander-preview with `npm run dev`. Art + design only —
// no engine gameplay (see docs/wog-commanders-plan.md).

export default function CommanderPreviewPage() {
  return (
    <main style={{ minHeight: "100vh", padding: 24, background: "#181410", color: "#e8ddc6" }}>
      <h1 style={{ fontFamily: '"Times New Roman", serif', color: "#f4d774", margin: 0 }}>
        Wake of Gods — Commander cards ({COMMANDER_SLUGS.length})
      </h1>
      <p style={{ maxWidth: "78ch", opacity: 0.85 }}>
        Beginning stats are <strong>Attack 2 / Defense 1 / Health 4 / Speed 5</strong> for every commander and are{" "}
        <strong>dynamic</strong> — the numbers are overlaid, not baked into the art, so they upgrade as the commander
        levels. Click <em>“Upgrades &amp; Skills”</em> on any card to change stats and pick primary/secondary skills.
        Art + design only; no engine gameplay yet.
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
            <CommanderCard slug={slug} />
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
