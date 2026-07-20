import { SpecialtyCard } from "@/components/specialty-card";
import { CommanderCard } from "@/components/commander-card";
import { coreUnitDefinitions } from "@/data/factions/units";
import { assetUrl } from "@/lib/asset-url";

/**
 * One-page visual QA for this session's Codex art + wiring.
 * Open /session-art-preview with `npm run dev`.
 */
const HERO_ASSETS = [
  {
    title: "Bin hero portrait",
    path: "/assets/anime/heroes/bin.png",
    wired: "MUST NOT match Sabers gold unit"
  },
  {
    title: "Astral Regent commander",
    path: "/assets/units-commander-ruler.webp",
    wired: "MUST NOT match Sabers gold unit"
  },
  {
    title: "Lingxi hero portrait",
    path: "/assets/anime/heroes/lingxi.png",
    wired: "hero board + specialty portrait strip"
  },
  {
    title: "Lingxi specialty icon",
    path: "/assets/specialty-card/icon-first_aid.webp",
    wired: "Healing Arts I/IV/VI center icon"
  },
  {
    title: "Sword Saint commander",
    path: "/assets/units-commander-sword_saint.webp",
    wired: "MUST NOT match True Inheritors unit art"
  },
  {
    title: "Classic commander equip paperdoll",
    path: "/assets/ui/commander-paperdoll-body.webp",
    wired: "classic equip popup body (+ card bust)"
  },
  {
    title: "Anime commander equip paperdoll",
    path: "/assets/ui/commander-paperdoll-body-anime.webp",
    wired: "Fuyuki equip popup — themed body, no card"
  },
  {
    title: "Wuxia commander equip paperdoll",
    path: "/assets/ui/commander-paperdoll-body-wuxia.webp",
    wired: "Azure Breeze equip popup — themed body, no card"
  }
] as const;

const AZURE_ORDER = [
  "azure_breeze.outer_disciples",
  "azure_breeze.inner_swordsmen",
  "azure_breeze.spirit_crane",
  "azure_breeze.sect_protectors",
  "azure_breeze.core_master",
  "azure_breeze.true_inheritors",
  "azure_breeze.mountain_guardian"
] as const;

export default function SessionArtPreviewPage() {
  const azureUnits = AZURE_ORDER.map((id) => coreUnitDefinitions[id]).filter(Boolean);
  const tierCounts = { bronze: 0, silver: 0, gold: 0 };
  for (const unit of azureUnits) {
    if (unit.tier === "bronze" || unit.tier === "silver" || unit.tier === "gold") {
      tierCounts[unit.tier] += 1;
    }
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, background: "#16120e", color: "#e8ddc6" }}>
      <h1 style={{ fontFamily: '"Times New Roman", serif', color: "#f4d774", margin: "0 0 8px" }}>
        Session art QA — Azure Breeze / Lingxi / Sword Saint
      </h1>
      <p style={{ maxWidth: "78ch", opacity: 0.85, marginBottom: 12 }}>
        Live game paths via <code>assetUrl()</code>. Open this page after <code>npm run dev</code>.
      </p>
      <p style={{ marginBottom: 28, padding: "10px 14px", border: "1px solid #27a9a0", borderRadius: 8, background: "rgb(39 169 160 / 12%)" }}>
        <strong>Azure Breeze tiers (must be 3 / 2 / 2):</strong> bronze {tierCounts.bronze} · silver {tierCounts.silver} ·
        gold {tierCounts.gold}
        <br />
        <span style={{ fontSize: 13, opacity: 0.9 }}>
          GOLD = True Inheritors + Mountain Guardian only. Bronze flyer = Spirit Crane. Silver mage = Core Formation
          Master.
        </span>
      </p>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 18 }}>
        {HERO_ASSETS.map((item) => (
          <article
            key={item.path}
            style={{
              border: "1px solid rgb(228 189 104 / 28%)",
              borderRadius: 12,
              padding: 14,
              background: "rgb(0 0 0 / 28%)"
            }}
          >
            <h2 style={{ margin: "0 0 6px", fontSize: 15, color: "#f0e0b8" }}>{item.title}</h2>
            <code style={{ display: "block", fontSize: 10, opacity: 0.7, marginBottom: 10, wordBreak: "break-all" }}>
              {item.path}
            </code>
            <div
              style={{
                minHeight: 200,
                display: "grid",
                placeItems: "center",
                background: "radial-gradient(circle, #2a2218, #0a0908)",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 8
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={item.title} src={assetUrl(item.path)} style={{ maxWidth: "100%", maxHeight: 300, objectFit: "contain" }} />
            </div>
            <p style={{ margin: 0, fontSize: 12, color: "#b8ad96" }}>{item.wired}</p>
          </article>
        ))}
      </section>

      <h2 style={{ margin: "36px 0 12px", color: "#f4d774", fontFamily: '"Times New Roman", serif' }}>
        Azure Breeze unit cards (few side) — check tier stars + distinct subjects
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
        {azureUnits.map((unit) => {
          const img = unit.few?.cardImage;
          return (
            <article
              key={unit.id}
              style={{
                border: "1px solid rgb(39 169 160 / 35%)",
                borderRadius: 10,
                padding: 10,
                background: "rgb(0 0 0 / 25%)"
              }}
            >
              <div style={{ fontSize: 12, color: "#74d2b6", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                {unit.tier} · {unit.type}
              </div>
              <strong style={{ display: "block", margin: "4px 0 8px", color: "#f0e0b8" }}>{unit.name}</strong>
              <div style={{ minHeight: 260, display: "grid", placeItems: "center", background: "#0a0908", borderRadius: 6 }}>
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={unit.name} src={assetUrl(img)} style={{ maxWidth: "100%", maxHeight: 280, objectFit: "contain" }} />
                ) : null}
              </div>
              <code style={{ display: "block", marginTop: 6, fontSize: 9, opacity: 0.55, wordBreak: "break-all" }}>
                {img}
              </code>
            </article>
          );
        })}
      </div>

      <h2 style={{ margin: "36px 0 12px", color: "#f4d774", fontFamily: '"Times New Roman", serif' }}>
        Lingxi Healing Arts specialties
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 18 }}>
        {(["specialty.lingxi.1", "specialty.lingxi.4", "specialty.lingxi.6"] as const).map((id) => (
          <div key={id}>
            <SpecialtyCard cardId={id} />
            <div style={{ textAlign: "center", fontSize: 12, opacity: 0.6, marginTop: 6 }}>{id}</div>
          </div>
        ))}
      </div>

      <h2 style={{ margin: "36px 0 12px", color: "#f4d774", fontFamily: '"Times New Roman", serif' }}>
        Sword Saint commander component
      </h2>
      <div style={{ maxWidth: 340 }}>
        <CommanderCard slug="sword_saint" />
      </div>

      <h2 style={{ margin: "36px 0 12px", color: "#f4d774" }}>Also</h2>
      <ul style={{ lineHeight: 1.8 }}>
        <li>
          <a href="/specialty-preview" style={{ color: "#9cc5ff" }}>
            /specialty-preview
          </a>
        </li>
        <li>
          <a href="/commander-preview" style={{ color: "#9cc5ff" }}>
            /commander-preview
          </a>
        </li>
        <li>
          Folder copy: <code>generated-session-art/</code>
        </li>
      </ul>
    </main>
  );
}
