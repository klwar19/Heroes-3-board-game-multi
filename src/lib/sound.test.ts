// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import soundManifest from "../../public/sounds/manifest.json";
import { isTableUiClickTarget, playLibrarySound, playLibrarySoundThen, playTableUiClickSound, playUnitSound, setSoundMuted } from "./sound";

/**
 * Records every <audio> the foley layer creates so a test asserts real
 * behaviour — which clip loads, in what order, how many times it replays —
 * rather than the presence of code. `fireEnded` simulates a clip finishing so
 * chained playback (sequences, repeats) advances exactly as it would live.
 */
class FakeAudio {
  static instances: FakeAudio[] = [];
  src = "";
  volume = 1;
  currentTime = 0;
  paused = true;
  playCount = 0;
  private listeners: Record<string, Array<() => void>> = {};
  constructor(src?: string) {
    this.src = src ?? "";
    FakeAudio.instances.push(this);
  }
  addEventListener(type: string, cb: () => void): void {
    (this.listeners[type] ??= []).push(cb);
  }
  play(): Promise<void> {
    this.paused = false;
    this.playCount += 1;
    return Promise.resolve();
  }
  fireEnded(): void {
    for (const cb of this.listeners.ended ?? []) {
      cb();
    }
  }
}

const library = soundManifest as Record<string, { src?: string; sequence?: string[]; random?: string[] }>;

beforeEach(() => {
  window.localStorage.clear();
  FakeAudio.instances = [];
  vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);
  setSoundMuted(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playLibrarySound", () => {
  it("plays a plain clip once", () => {
    playLibrarySound("units/arch-devil-attack");
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/sounds/units/arch-devil-attack.mp3");
    expect(FakeAudio.instances[0].playCount).toBe(1);
  });

  it("replays a repeat:2 clip on the same element when it ends", () => {
    // Movement loops carry repeat:2 (play twice back-to-back) on one element.
    playLibrarySound("units/arch-devil-move");
    const audio = FakeAudio.instances[0];
    expect(FakeAudio.instances).toHaveLength(1);
    expect(audio.playCount).toBe(1);
    audio.fireEnded();
    expect(FakeAudio.instances).toHaveLength(1); // same element, no new clip
    expect(audio.playCount).toBe(2);
    audio.fireEnded();
    expect(audio.playCount).toBe(2); // stops after the second play
  });

  it("plays a sequence in order — the next member starts only after the previous ends", () => {
    // The Arch Devil teleport: EXT1 (vanish) fully plays, THEN EXT2 (reappear).
    playLibrarySound("units/arch-devil-teleport");
    expect(FakeAudio.instances).toHaveLength(1);
    const first = FakeAudio.instances[0];
    expect(first.src).toContain("/sounds/units/arch-devil-special.mp3");
    expect(first.src).not.toContain("special-2");
    expect(first.playCount).toBe(1);

    // EXT2 must not have started yet — order matters.
    first.fireEnded();
    expect(FakeAudio.instances).toHaveLength(2);
    const second = FakeAudio.instances[1];
    expect(second.src).toContain("/sounds/units/arch-devil-special-2.mp3");
    expect(second.playCount).toBe(1);

    // Nothing follows the last member.
    second.fireEnded();
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it("picks a single member from a random pool", () => {
    // music/battle is the battle-begin pool (battle-00..07): one clip per call.
    const members = library["music/battle"].random ?? [];
    expect(members.length).toBeGreaterThan(1);
    vi.spyOn(Math, "random").mockReturnValue(0); // deterministic: first member
    playLibrarySound("music/battle");
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/sounds/music/battle-00.mp3");
  });

  it("stays silent while muted", () => {
    setSoundMuted(true);
    playLibrarySound("units/arch-devil-teleport");
    expect(FakeAudio.instances).toHaveLength(0);
  });
});

describe("in-game UI click sound", () => {
  // A tiny DOM the delegated table handler runs against.
  function build(): { button: HTMLButtonElement; icon: HTMLElement; board: HTMLButtonElement; quiet: HTMLButtonElement; disabled: HTMLButtonElement; plain: HTMLElement } {
    document.body.innerHTML = `
      <main class="tableRoot">
        <button id="cmd"><span id="icon">End turn</span></button>
        <button id="disabled" disabled>Wait</button>
        <span data-no-click-sound><button id="quiet">Silent</button></span>
        <div class="boardFelt"><button id="cell">Cell 9</button></div>
        <div id="plain">not a button</div>
      </main>`;
    return {
      button: document.getElementById("cmd") as HTMLButtonElement,
      icon: document.getElementById("icon") as HTMLElement,
      board: document.getElementById("cell") as HTMLButtonElement,
      quiet: document.getElementById("quiet") as HTMLButtonElement,
      disabled: document.getElementById("disabled") as HTMLButtonElement,
      plain: document.getElementById("plain") as HTMLElement
    };
  }

  it("plays the ui/button click once for a chrome button (or an icon inside it)", () => {
    const dom = build();
    playTableUiClickSound({ target: dom.button });
    expect(FakeAudio.instances).toHaveLength(1);
    expect(FakeAudio.instances[0].src).toContain("/sounds/ui/button.mp3");

    // A click that lands on the label/icon inside the button still counts.
    playTableUiClickSound({ target: dom.icon });
    expect(FakeAudio.instances).toHaveLength(2);
  });

  it("stays silent for the combat board, opted-out, disabled, and non-button targets", () => {
    const dom = build();
    expect(isTableUiClickTarget(dom.board)).toBe(false); // .boardFelt has its own foley
    expect(isTableUiClickTarget(dom.quiet)).toBe(false); // data-no-click-sound
    expect(isTableUiClickTarget(dom.disabled)).toBe(false); // disabled button
    expect(isTableUiClickTarget(dom.plain)).toBe(false); // not a button
    for (const target of [dom.board, dom.quiet, dom.disabled, dom.plain]) {
      playTableUiClickSound({ target });
    }
    expect(FakeAudio.instances).toHaveLength(0);

    // CONTROL: the chrome button is a valid target.
    expect(isTableUiClickTarget(dom.button)).toBe(true);
  });

  it("stays silent while muted", () => {
    const dom = build();
    setSoundMuted(true);
    playTableUiClickSound({ target: dom.button });
    expect(FakeAudio.instances).toHaveLength(0);
  });
});

describe("creature movement sound repeats", () => {
  // Most creatures loop a short footstep/flap clip for a full move (repeat:2 =
  // play twice). A handful instead have a self-contained move clip (a whoosh /
  // slither / drone / wing-flap) that must play exactly ONCE so it does not
  // echo. Driving it through playUnitSound proves the whole chain — unit id
  // -> voice -> move clip -> repeat count — yields a single play.
  it.each([
    ["conflux.energy_elementals", "energy-elemental"],
    ["conflux.magic_elementals", "magic-elemental"],
    ["dungeon.evil_eyes", "evil-eye"],
    ["cove.haspids", "sea-serpent"], // Haspids speak with the Sea Serpent voice
    ["dungeon.harpies", "harpy"] // the Harpy's wing-flap whoosh is self-contained
  ])("plays %s's move clip exactly once (no loop)", (unitDefId, voice) => {
    playUnitSound(unitDefId, "move");
    expect(FakeAudio.instances).toHaveLength(1);
    const audio = FakeAudio.instances[0];
    expect(audio.src).toContain(`/sounds/units/${voice}-move.mp3`);
    expect(audio.playCount).toBe(1);
    audio.fireEnded();
    // A looped (repeat:2) clip would replay here; these must not.
    expect(audio.playCount).toBe(1);
  });

  it("plays the base Beholder's move clip once too (it is byte-identical to the Evil Eye's)", () => {
    // No roster unit speaks with the Beholder voice today, but its -move clip is
    // the same file as the Evil Eye's, so it must not double-echo either —
    // keeping the identical sound consistent however it is ever played.
    playLibrarySound("units/beholder-move");
    const audio = FakeAudio.instances[0];
    expect(audio.src).toContain("/sounds/units/beholder-move.mp3");
    expect(audio.playCount).toBe(1);
    audio.fireEnded();
    expect(audio.playCount).toBe(1);
  });

  it("still loops an ordinary footstep move clip twice (control)", () => {
    // The Griffin keeps the default repeat:2 — its short flap loops for the move,
    // so the play-once change above is a real divergence, not a global flip.
    playUnitSound("castle.griffins", "move");
    const audio = FakeAudio.instances[0];
    expect(audio.src).toContain("/sounds/units/griffin-move.mp3");
    expect(audio.playCount).toBe(1);
    audio.fireEnded();
    expect(audio.playCount).toBe(2);
    audio.fireEnded();
    expect(audio.playCount).toBe(2);
  });
});

describe("sequenceDelayMs (paced virtual sequences)", () => {
  // The Doom monsters introduced `sequenceDelayMs`: a pause between the members
  // of a virtual `sequence`. These drive it through the real playback chain so
  // the timing is proven, not just present.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits sequenceDelayMs before starting the next member, and still honours a member's repeat", () => {
    // doom-demon-move = ["doom/dssgtsit", "doom/dsdmact-move"] with a 90ms gap;
    // the second member (dsdmact-move) itself has repeat:2.
    playLibrarySound("units/doom-demon-move");
    expect(FakeAudio.instances).toHaveLength(1);
    const sight = FakeAudio.instances[0];
    expect(sight.src).toContain("/sounds/doom/dssgtsit.mp3");
    expect(sight.playCount).toBe(1);

    // The first member ends: the next must NOT start until the 90ms gap elapses.
    sight.fireEnded();
    expect(FakeAudio.instances).toHaveLength(1);
    vi.advanceTimersByTime(89);
    expect(FakeAudio.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeAudio.instances).toHaveLength(2);

    const walk = FakeAudio.instances[1];
    expect(walk.src).toContain("/sounds/doom/dsdmact.mp3");
    expect(walk.playCount).toBe(1);
    // repeat:2 replays on the same element (the gap is BETWEEN members, not
    // between a member's own repeats).
    walk.fireEnded();
    expect(FakeAudio.instances).toHaveLength(2);
    expect(walk.playCount).toBe(2);
    walk.fireEnded();
    expect(walk.playCount).toBe(2);
  });

  it("advances a delay-less sequence synchronously (default 0 = byte-identical old timing)", () => {
    // The Arch Devil teleport has no sequenceDelayMs: even with fake timers
    // pending, the second member starts the instant the first ends — no
    // setTimeout is scheduled, so old callers are unaffected.
    playLibrarySound("units/arch-devil-teleport");
    expect(FakeAudio.instances).toHaveLength(1);
    FakeAudio.instances[0].fireEnded();
    expect(FakeAudio.instances).toHaveLength(2);
    expect(FakeAudio.instances[1].src).toContain("/sounds/units/arch-devil-special-2.mp3");
    // Nothing was queued behind a timer.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("playLibrarySoundThen carries the delay and fires onDone after the whole sequence", () => {
    const onDone = vi.fn();
    playLibrarySoundThen("units/doom-demon-move", 0.5, onDone);
    expect(FakeAudio.instances).toHaveLength(1);

    FakeAudio.instances[0].fireEnded();
    // Still waiting out the gap: the second member has not started and onDone
    // must not have fired.
    expect(FakeAudio.instances).toHaveLength(1);
    expect(onDone).not.toHaveBeenCalled();

    vi.advanceTimersByTime(90);
    expect(FakeAudio.instances).toHaveLength(2);
    expect(onDone).not.toHaveBeenCalled();

    // Exhaust the second member's repeat:2, then let any trailing gap elapse.
    FakeAudio.instances[1].fireEnded();
    FakeAudio.instances[1].fireEnded();
    vi.runAllTimers();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
