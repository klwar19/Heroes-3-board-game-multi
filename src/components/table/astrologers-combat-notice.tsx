import type { GameState } from "@/engine/state";

export function AstrologersCombatNotice({ state }: { state: GameState }) {
  if (state.adventure?.astrologers?.activeCardId !== "astrologers.offense") return null;
  return (
    <p className="combatRuleReminder" role="note">
      <strong>Astrologers — Offense:</strong> Cards that provide Defense now provide Attack instead.
      {" "}Play those bonuses when attacking; they cannot increase Defense while this event is active.
    </p>
  );
}
