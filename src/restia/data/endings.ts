/**
 * Endings. A scene reaches one with `{ effects: [{ kind: "ending", id }] }`.
 * - Bad ends are game overs: Peri's Green Room reviews the flop, gives `hint`, and
 *   rewinds to the last checkpoint with a penalty (engine/story.ts, Monster Girl Quest style).
 * - Other kinds end the story for good and show the ending card.
 * `{who}` in the text is replaced with the lost character's name.
 */
export type EndingKind = "bad" | "normal" | "good" | "true";

export type EndingDef = {
  id: string;
  title: string;
  kind: EndingKind;
  /** The epitaph under the title. */
  text: string;
  /** Peri's advice in the Green Room (bad ends). */
  hint?: string;
};

const LIST: EndingDef[] = [
  {
    id: "badLostMember",
    title: "Bad End: An Empty Chair",
    kind: "bad",
    text: "{who} didn't get up. The snow covered everything by morning. Garr set the table for one less, and nobody could make themselves eat.",
    hint: "Party members don't come back, Jester. Heal early, retreat when it smells wrong, and stop hugging danger like it's a golden retriever."
  },
  {
    id: "badGaveUp",
    title: "Bad End: Delivery Boy",
    kind: "bad",
    text: "Bin tore up the contract and went back to delivering chicken. The show was cancelled. Somewhere in the north, a third plate gathers dust on a table nobody sits at any more.",
    hint: "Quitting is allowed. It's just REALLY bad television. Try the option with more spine."
  },
  {
    id: "badFrostwood",
    title: "Bad End: Snow Keeps Everything",
    kind: "bad",
    text: "The Frostwood doesn't care who you were on Earth. By spring the wolves have scattered what's left, and the only thing anyone finds is a rude little coin in the thaw.",
    hint: "The Frostwood at night is not a vibe. Go home before dark, or bring friends who bite back."
  }
];

export const ENDINGS: Record<string, EndingDef> = Object.fromEntries(LIST.map((ending) => [ending.id, ending]));
export const ENDING_COUNT = LIST.length;

/** Days of "Bad Ratings" after a rewind, and what they cost. */
export const PENALTY_DAYS = 3;
export const PENALTY_STAT_MULT = 0.9;
/** Peri's opening lines in the Green Room, rotated by how often you've been here. */
export const GREEN_ROOM_QUIPS = [
  "Aaand CUT. Wow. That was a flop. Like, a real one. The audience is filing out.",
  "Back again? I'm starting to think you like it in here. The couch is not that comfortable.",
  "You know what the ratings are doing right now? Neither do I. They fell off the chart.",
  "Honestly, as a blooper it's gold. As a plot? Tragic. Let's fix it."
];
