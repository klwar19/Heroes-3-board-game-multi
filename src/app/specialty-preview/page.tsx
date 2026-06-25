import { SpecialtyCard } from "@/components/specialty-card";
import { canRenderSpecialtyCard, parseSpecialtyCardId } from "@/components/specialty-card-data";
import { cardLibrary } from "@/data/cards/library";

// Dev preview: EVERY art-less hero specialty (no printed scan), drawn live by the
// native SpecialtyCard (ported from the HoMM3 Hero Creator, MIT). Open
// /specialty-preview with `npm run dev` to see and tune the cards — they render
// from game data, no Gemini and no screenshots. The list is derived from the
// card library, so newly-added art-less heroes appear automatically.

export default function SpecialtyPreviewPage() {
  const cardIds = Object.keys(cardLibrary)
    .filter((id) => parseSpecialtyCardId(id) && canRenderSpecialtyCard(id))
    .sort();

  return (
    <main style={{ minHeight: "100vh", padding: "24px", background: "#262019", color: "#e8ddc6" }}>
      <h1 style={{ fontFamily: '"Times New Roman", serif', color: "#f4d774", margin: 0 }}>
        Art-less hero specialty cards — native render ({cardIds.length})
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
