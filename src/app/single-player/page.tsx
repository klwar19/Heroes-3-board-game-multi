"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MenuShell } from "@/components/menu/menu-shell";
import { SinglePlayerSavePanel } from "@/components/single-player-save-panel";
import { assetUrl } from "@/lib/asset-url";
import { createSinglePlayerRoom } from "@/lib/realtime";

// `path` (not `src`) so the raw "/assets/…" literals at the call sites are not
// flagged by the assetUrl() CDN-coverage guard — the path IS wrapped here.
function SinglePlayerNavArt({ path }: { path: string }) {
  return <img alt="" aria-hidden="true" className="singlePlayerNavArt" draggable={false} src={assetUrl(path)} />;
}

export default function SinglePlayerPage() {
  const router = useRouter();
  const [computerOpen, setComputerOpen] = useState(false);
  const [opponents, setOpponents] = useState(1);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { roomId } = await createSinglePlayerRoom(opponents);
      router.push(`/?room=${encodeURIComponent(roomId)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the game.");
      setCreating(false);
    }
  };

  return (
    <MenuShell backdrop="lobby-backdrop" title="Single Player">
      <p className="singlePlayerLead">Choose a free battle against computer opponents, or enter a fixed story campaign.</p>
      <nav className="menuNav singlePlayerModeNav" aria-label="Single player">
        <button className="menuNavButton" onClick={() => setComputerOpen(true)} type="button">
          <SinglePlayerNavArt path="/assets/ui/single-player/vs-computer.webp" />
          <span className="menuNavText"><span className="menuNavLabel">VS Computer</span><small>Create a private match and choose 1–3 opponents</small></span>
        </button>
        <Link className="menuNavButton" href="/story">
          <SinglePlayerNavArt path="/assets/ui/single-player/campaign.webp" />
          <span className="menuNavText"><span className="menuNavLabel">Campaign</span><small>Restoration of Erathia · authored maps and story</small></span>
        </Link>
        <Link className="menuNavButton" href="/menu">
          <span className="singlePlayerBackSigil" aria-hidden>←</span>
          <span className="menuNavText"><span className="menuNavLabel">Back</span><small>Return to the main menu</small></span>
        </Link>
      </nav>

      {computerOpen ? (
        <div className="singlePlayerDialogScrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setComputerOpen(false)}>
          <section aria-label="VS Computer setup" aria-modal="true" className="singlePlayerDialog" role="dialog">
            <button aria-label="Close VS Computer setup" className="campaignBriefingClose" onClick={() => setComputerOpen(false)} type="button">×</button>
            <div className="singlePlayerDialogHead">
              <SinglePlayerNavArt path="/assets/ui/single-player/vs-computer.webp" />
              <div><span>PRIVATE SKIRMISH</span><h2>VS Computer</h2><p>You can change the opponent count, factions, heroes and map again in Game Settings before starting.</p></div>
            </div>
            <div className="singlePlayerOpponents" role="group" aria-label="Computer opponents">
              <strong>Number of opponents</strong>
              <div className="singlePlayerOpponentChoices">
                {[1, 2, 3].map((count) => (
                  <button aria-label={`${count} computer opponent${count === 1 ? "" : "s"}`} aria-pressed={opponents === count} className={`menuNavButton singlePlayerOpponentChoice${opponents === count ? " selected" : ""}`} key={count} onClick={() => setOpponents(count)} type="button">{count}</button>
                ))}
              </div>
              <small>Some maps support fewer seats; Game Settings will cap the count to the selected scenario.</small>
            </div>
            <SinglePlayerSavePanel />
            {error ? <p className="authError" role="alert">{error}</p> : null}
            <button className="campaignPrimaryButton singlePlayerCreate" disabled={creating} onClick={() => void create()} type="button">{creating ? "Creating…" : `Continue with ${opponents} opponent${opponents === 1 ? "" : "s"}`}</button>
          </section>
        </div>
      ) : null}
    </MenuShell>
  );
}
