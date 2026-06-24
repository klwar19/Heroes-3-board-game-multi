import { SpecialtyCard, canRenderSpecialtyCard } from "@/components/specialty-card";

// Dev preview: every art-less Bulwark / Conflux hero specialty, drawn live by the
// native SpecialtyCard (ported from the HoMM3 Hero Creator, MIT). Open
// /specialty-preview with `npm run dev` to see and tune the cards — they render
// from game data, no Gemini and no screenshots.

const HEROES = ["dhuin", "creyle", "eikthurn", "glacius", "oidana", "kriv", "luna", "ciele"];
const LEVELS = [1, 4, 6] as const;

export default function SpecialtyPreviewPage() {
  const cardIds = HEROES.flatMap((slug) => LEVELS.map((level) => `specialty.${slug}.${level}`)).filter(
    canRenderSpecialtyCard
  );

  return (
    <main style={{ minHeight: "100vh", padding: "24px", background: "#262019", color: "#e8ddc6" }}>
      <h1 style={{ fontFamily: '"Times New Roman", serif', color: "#f4d774", margin: 0 }}>
        Bulwark / Conflux specialty cards — native render
      </h1>
      <p style={{ maxWidth: "70ch", opacity: 0.85 }}>
        Drawn live by <code>SpecialtyCard</code> from game data — no Gemini, no screenshots. Ported from the{" "}
        <a href="https://github.com/k-adam/Homm3_hero_creator" style={{ color: "#9cc5ff" }}>
          HoMM3 Hero Creator
        </a>{" "}
        (MIT © 2025 Adam Kecskes). Tune the proportions in <code>globals.css</code> (the <code>.sc*</code> rules).
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: "22px",
          marginTop: "20px"
        }}
      >
        {cardIds.map((id) => (
          <div key={id}>
            <SpecialtyCard cardId={id} />
            <div style={{ textAlign: "center", fontSize: "12px", opacity: 0.6, marginTop: "6px" }}>{id}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
