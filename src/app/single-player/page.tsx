"use client";

/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MapPinned } from "lucide-react";
import { MenuShell } from "@/components/menu/menu-shell";
import { SinglePlayerSavePanel } from "@/components/single-player-save-panel";
import { assetUrl } from "@/lib/asset-url";
import { createSinglePlayerRoom } from "@/lib/realtime";

// `path` (not `src`) so the raw "/assets/…" literals at the call sites are not
// flagged by the assetUrl() CDN-coverage guard — the path IS wrapped here.
function SinglePlayerMenuArt({ path }: { path: string }) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className="singlePlayerMenuArt"
      draggable={false}
      src={assetUrl(path)}
    />
  );
}

export default function SinglePlayerPage() {
  const router = useRouter();
  const [computerOpen, setComputerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const { roomId } = await createSinglePlayerRoom();
      router.push(`/?room=${encodeURIComponent(roomId)}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the game.",
      );
      setCreating(false);
    }
  };

  return (
    <MenuShell backdrop="lobby-backdrop" title="Single Player" wide>
      <nav className="menuNav singlePlayerArtNav" aria-label="Single player">
        <button
          aria-label="SCENARIO"
          className="menuNavButton"
          onClick={() => setComputerOpen(true)}
          type="button"
        >
          <SinglePlayerMenuArt path="/assets/ui/menu/buttons/scenario.webp" />
        </button>
        <Link aria-label="CAMPAIGN" className="menuNavButton" href="/story">
          <SinglePlayerMenuArt path="/assets/ui/menu/buttons/campaign.webp" />
        </Link>
        <Link aria-label="BACK" className="menuNavButton" href="/menu">
          <SinglePlayerMenuArt path="/assets/ui/menu/buttons/back.webp" />
        </Link>
      </nav>

      {computerOpen ? (
        <div
          className="singlePlayerDialogScrim"
          role="presentation"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setComputerOpen(false)
          }
        >
          <section
            aria-label="VS Computer setup"
            aria-modal="true"
            className="singlePlayerDialog"
            role="dialog"
          >
            <button
              aria-label="Close VS Computer setup"
              className="campaignBriefingClose"
              onClick={() => setComputerOpen(false)}
              type="button"
            >
              ×
            </button>
            <div className="singlePlayerDialogHead">
              <span className="singlePlayerDialogIcon">
                <MapPinned aria-hidden size={30} />
              </span>
              <div>
                <span>PRIVATE SKIRMISH</span>
                <h2>VS Computer</h2>
                <p>
                  The map determines how many enemies you face and where
                  everyone starts. You will choose the map, factions and heroes
                  at the private table.
                </p>
              </div>
            </div>
            <div
              className="singlePlayerOpponents"
              role="note"
              aria-label="Map-driven solo setup"
            >
              <strong>Map-driven opponents</strong>
              <small>
                No enemy-count picker is needed. Built-in maps use their solo
                deployment; designed maps can set your exact Town, each AI Town,
                and different starting war chests. Those solo settings never
                change multiplayer on the same map.
              </small>
            </div>
            <SinglePlayerSavePanel />
            {error ? (
              <p className="authError" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="campaignPrimaryButton singlePlayerCreate"
              disabled={creating}
              onClick={() => void create()}
              type="button"
            >
              {creating ? "Creating…" : "Create private skirmish"}
            </button>
          </section>
        </div>
      ) : null}
    </MenuShell>
  );
}
