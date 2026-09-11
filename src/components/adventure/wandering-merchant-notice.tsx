"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Minus } from "lucide-react";
import { cardLibrary } from "@/data/cards/library";
import { assetUrl } from "@/lib/asset-url";
import type { GameAction, GameState, PlayerId } from "@/engine";
import { getActiveAstrologersCard, wanderingMerchantAvailable, wanderingMerchantBlockReason, wanderingMerchantOffers } from "@/engine/adventure";

export function WanderingMerchantNotice({ state, viewerPlayerId, onAction }: {
  state: GameState; viewerPlayerId: PlayerId; onAction: (action: GameAction) => void;
}) {
  const key = `${state.seed}:${state.round}:${viewerPlayerId}`;
  const [minimizedKey, setMinimizedKey] = useState<string | null>(null);
  const [shopKey, setShopKey] = useState<string | null>(null);
  useEffect(() => {
    const open = () => { setMinimizedKey(null); setShopKey(key); };
    window.addEventListener("open-wandering-merchant", open);
    return () => window.removeEventListener("open-wandering-merchant", open);
  }, [key]);
  if (!wanderingMerchantAvailable(state, viewerPlayerId)) return null;
  const effect = getActiveAstrologersCard(state)?.effect;
  const discount = effect?.type === "WAR_MACHINE_DISCOUNT_OFFER" ? effect.discountGold : 0;
  const blocked = wanderingMerchantBlockReason(state, viewerPlayerId);
  const offers = wanderingMerchantOffers(state, viewerPlayerId);
  if (minimizedKey === key) return (
    <button className="marketTab wanderingMerchantTab merchantNoticeChip" type="button"
      aria-label="Expand Wandering Merchant notice" aria-expanded={false} onClick={() => setMinimizedKey(null)}>
      <img alt="" src={assetUrl("/fx/wandering-merchant-notice.webp")} />
      <span>Wandering Merchant<strong>{discount} gold off · Open notice</strong></span>
    </button>
  );
  return (
    <aside className="merchantNotice" aria-label="Wandering Merchant offer">
      <div className="merchantNoticeArt">
        <img alt="Traveling merchant offering a ballista and first aid tent" src={assetUrl("/fx/wandering-merchant-notice.webp")} />
        <span className="merchantNoticeBadge">{discount} GOLD OFF</span>
        <button className="merchantNoticeMinimize" type="button" aria-label="Minimize Wandering Merchant notice"
          onClick={() => setMinimizedKey(key)}><Minus size={20} /></button>
      </div>
      <div className="merchantNoticeBody">
        <small>ROUND {state.round} · LIMITED OFFER</small><h3>Wandering Merchant</h3>
        <p>Buy one War Machine from anywhere — even during another player&apos;s turn or battle.</p>
        {blocked ? (
          // Own battle / unfinished hand draw: no shop to open yet — the reason
          // below says what to finish first (never an empty offer list).
          <button className="merchantNoticeBuy" type="button" disabled>Open shop · Save {discount} gold</button>
        ) : shopKey !== key ? (
          <button className="merchantNoticeBuy" type="button" onClick={() => setShopKey(key)}>Open shop · Save {discount} gold</button>
        ) : (
          <div className="merchantNoticeOffers" aria-label="Discounted War Machines">
            {offers.map((offer) => (
              <button key={offer.cardId} className="merchantNoticeBuy" type="button" disabled={!offer.affordable}
                onClick={() => onAction({ type: "BUY_WANDERING_MERCHANT", playerId: viewerPlayerId, cardId: offer.cardId })}>
                Buy {cardLibrary[offer.cardId]?.name ?? offer.cardId} · {offer.cost.gold ?? 0} gold
                {offer.cost.buildingMaterials ? ` · ${offer.cost.buildingMaterials} materials` : ""}
                {offer.cost.valuables ? ` · ${offer.cost.valuables} valuables` : ""}
                {!offer.affordable ? " — insufficient resources" : ""}
              </button>
            ))}
          </div>
        )}
        <small aria-live="polite">{blocked ?? "Once per player. Offer ends with this round. Bought cards go to your hand."}</small>
      </div>
    </aside>
  );
}
