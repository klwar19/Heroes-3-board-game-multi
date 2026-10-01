"use client";

/**
 * The Options dialog body — one place for every per-browser preference: audio
 * mix, layout / screen, graphics & motion, story text. Lazy-loaded and portalled
 * by SettingsHost (settings-dialog.tsx) when openSettings() is called. Every
 * control writes an existing or new preference store that the game actually
 * reads; nothing here touches GameState or the server.
 */
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  Gauge,
  Languages,
  Lightbulb,
  Maximize,
  MicVocal,
  Monitor,
  Music,
  Play,
  RotateCcw,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sun,
  Type,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { closeSettings, setSettingsTab, type SettingsTab } from "@/lib/settings-dialog";
import { AUDIO_MIX_DEFAULTS, getAudioMix, setAudioMix, subscribeAudioMix, type AudioMix } from "@/lib/audio-mix";
import {
  DISPLAY_PREFERENCE_DEFAULTS,
  STORY_TEXT_SCALES,
  getDisplayPreferences,
  setDisplayPreferences,
  subscribeDisplayPreferences,
  type MotionPreference,
} from "@/lib/display-preferences";
import { isMusicMuted, setMusicMuted, subscribeMusic } from "@/lib/music";
import { isSoundMuted, playLibrarySound, setSoundMuted, subscribeSoundMuted } from "@/lib/sound";
import { useUiModePreference } from "@/lib/ui-mode-preference";
import { useSkipAnimationsPreference } from "@/lib/animation-preference";
import { HEX_SPEED_DEFAULTS, HEX_SPEED_PRESETS, hexSpeedSteps, useHexBattleSpeed, type HexSpeedChannel } from "@/lib/hex-battle-speed";
import { useStoryLanguage } from "@/lib/story-language";
import { useHelperCoachPreference } from "@/lib/helper-coach-preference";
import { formatHexSpeed, hexSpeedStepIndex } from "@/components/table/hex-battle-options";
import { wakeLockSupported } from "./preferences-runtime";

const TABS: ReadonlyArray<{ key: SettingsTab; label: string; hint: string; icon: ReactNode }> = [
  { key: "audio", label: "Audio", hint: "Volume & sound", icon: <Volume2 aria-hidden="true" /> },
  { key: "display", label: "Display", hint: "Layout & screen", icon: <Monitor aria-hidden="true" /> },
  { key: "graphics", label: "Graphics", hint: "Motion & speed", icon: <Sparkles aria-hidden="true" /> },
  { key: "text", label: "Text & help", hint: "Story & tips", icon: <Type aria-hidden="true" /> },
];

// ---------------------------------------------------------------------------
// Shared controls
// ---------------------------------------------------------------------------

function OptionRow({ icon, title, detail, children }: { icon?: ReactNode; title: string; detail?: ReactNode; children: ReactNode }) {
  return (
    <div className="optionsRow">
      <div className="optionsRowText">
        <span className="optionsRowTitle">
          {icon}
          {title}
        </span>
        {detail ? <small>{detail}</small> : null}
      </div>
      <div className="optionsRowControl">{children}</div>
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className="optionsSwitch"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span className="optionsSwitchTrack" aria-hidden="true">
        <span className="optionsSwitchThumb" />
      </span>
      <span className="optionsSwitchState">{checked ? "On" : "Off"}</span>
    </button>
  );
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div aria-label={label} className="optionsSegmented" role="radiogroup">
      {options.map((option) => (
        <button
          aria-checked={option.value === value}
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          role="radio"
          title={option.title}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function VolumeSlider({
  label,
  value,
  onChange,
  muted,
  onToggleMute,
}: {
  label: string;
  value: number;
  onChange: (next: number) => void;
  muted?: boolean;
  onToggleMute?: () => void;
}) {
  const percent = Math.round(value * 100);
  return (
    <div className={`optionsVolume${muted ? " isMuted" : ""}`}>
      {onToggleMute ? (
        <button
          aria-label={muted ? `Unmute ${label.toLowerCase()}` : `Mute ${label.toLowerCase()}`}
          aria-pressed={muted}
          className="optionsMuteButton"
          onClick={onToggleMute}
          title={muted ? "Muted — click to unmute" : "Click to mute"}
          type="button"
        >
          {muted ? <VolumeX aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
        </button>
      ) : null}
      <input
        aria-label={`${label} volume`}
        aria-valuetext={muted ? `${percent}% (muted)` : `${percent}%`}
        max={100}
        min={0}
        onChange={(event) => onChange(Number(event.currentTarget.value) / 100)}
        step={5}
        style={{ ["--fill" as string]: `${percent}%` }}
        type="range"
        value={percent}
      />
      <output>{muted ? "Muted" : `${percent}%`}</output>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function useAudioMix(): AudioMix {
  return useSyncExternalStore(subscribeAudioMix, getAudioMix, () => AUDIO_MIX_DEFAULTS);
}

function useDisplayPrefs() {
  return useSyncExternalStore(subscribeDisplayPreferences, getDisplayPreferences, () => DISPLAY_PREFERENCE_DEFAULTS);
}

function AudioTab() {
  const mix = useAudioMix();
  const musicMuted = useSyncExternalStore(subscribeMusic, isMusicMuted, () => false);
  const effectsMuted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false);
  return (
    <>
      <OptionRow icon={<SlidersHorizontal aria-hidden="true" />} title="Master volume" detail="Scales everything below.">
        <VolumeSlider label="Master" onChange={(master) => setAudioMix({ master })} value={mix.master} />
      </OptionRow>
      <OptionRow icon={<Music aria-hidden="true" />} title="Music" detail="Menu, map, town and battle themes.">
        <VolumeSlider
          label="Music"
          muted={musicMuted}
          onChange={(music) => setAudioMix({ music })}
          onToggleMute={() => setMusicMuted(!musicMuted)}
          value={mix.music}
        />
      </OptionRow>
      <OptionRow
        icon={<Sparkles aria-hidden="true" />}
        title="Sound effects"
        detail={
          <>
            Combat, spells, cards, dice, clicks.{" "}
            <button
              className="optionsInlineButton"
              disabled={effectsMuted}
              onClick={() => playLibrarySound("ui/your-turn", 0.55)}
              type="button"
            >
              <Play aria-hidden="true" /> Test
            </button>
          </>
        }
      >
        <VolumeSlider
          label="Effects"
          muted={effectsMuted}
          onChange={(effects) => setAudioMix({ effects })}
          onToggleMute={() => setSoundMuted(!effectsMuted)}
          value={mix.effects}
        />
      </OptionRow>
      <OptionRow
        icon={<MicVocal aria-hidden="true" />}
        title="Character voices"
        detail="Spoken unit and hero lines. The effects mute silences these too."
      >
        <VolumeSlider label="Voices" muted={effectsMuted} onChange={(voices) => setAudioMix({ voices })} value={mix.voices} />
      </OptionRow>
      <OptionRow title="Play in background" detail="Off: music pauses and effects stay silent while this tab is hidden.">
        <Switch checked={mix.background} label="Play audio while the tab is in the background" onChange={(background) => setAudioMix({ background })} />
      </OptionRow>
      <p className="optionsNote">
        iPhone and iPad browsers ignore web volume levels; there, use the mute buttons or the device volume.
      </p>
    </>
  );
}

function useFullscreen(): { supported: boolean; active: boolean; toggle: () => void } {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSupported(document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === "function");
    setActive(document.fullscreenElement !== null && document.fullscreenElement !== undefined);
    /* eslint-enable react-hooks/set-state-in-effect */
    const onChange = () => setActive(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else document.documentElement.requestFullscreen().catch(() => undefined);
  }, []);
  return { supported, active, toggle };
}

function DisplayTab() {
  const { uiMode, recommended, setPreference } = useUiModePreference();
  const prefs = useDisplayPrefs();
  const fullscreen = useFullscreen();
  const [awakeSupported, setAwakeSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAwakeSupported(wakeLockSupported());
  }, []);
  return (
    <>
      <OptionRow
        icon={uiMode === "phone" ? <Smartphone aria-hidden="true" /> : <Monitor aria-hidden="true" />}
        title="Layout"
        detail={`Phone = tabbed one-column table for small touch screens. Suggested for this device: ${recommended === "phone" ? "Phone" : "Computer"}.`}
      >
        <Segmented
          label="Layout"
          onChange={(value) => setPreference(value)}
          options={[
            { value: "computer", label: <><Monitor aria-hidden="true" /> Computer</> },
            { value: "phone", label: <><Smartphone aria-hidden="true" /> Phone</> },
          ]}
          value={uiMode}
        />
      </OptionRow>
      <OptionRow
        icon={<Maximize aria-hidden="true" />}
        title="Full screen"
        detail={fullscreen.supported ? "Hide the browser bars. Esc leaves full screen." : "This browser does not allow full screen for web pages."}
      >
        <Switch checked={fullscreen.active} disabled={!fullscreen.supported} label="Full screen" onChange={fullscreen.toggle} />
      </OptionRow>
      <OptionRow
        icon={<Sun aria-hidden="true" />}
        title="Keep screen awake"
        detail={
          awakeSupported
            ? "Stops a phone or tablet from dimming while the game is open."
            : "Not supported by this browser."
        }
      >
        <Switch
          checked={prefs.keepAwake}
          disabled={!awakeSupported}
          label="Keep screen awake"
          onChange={(keepAwake) => setDisplayPreferences({ keepAwake })}
        />
      </OptionRow>
    </>
  );
}

const MOTION_OPTIONS: ReadonlyArray<{ value: MotionPreference; label: string; title: string }> = [
  { value: "system", label: "Device", title: "Follow the device's reduce-motion setting" },
  { value: "reduced", label: "Reduced", title: "Always reduce motion" },
  { value: "full", label: "Full", title: "Always play full motion" },
];

const SPEED_CHANNELS: ReadonlyArray<{ key: HexSpeedChannel; label: string }> = [
  { key: "move", label: "Movement" },
  { key: "attack", label: "Attacks" },
  { key: "reaction", label: "Reactions" },
];

function GraphicsTab() {
  const prefs = useDisplayPrefs();
  const { skipAnimations, setSkipAnimations } = useSkipAnimationsPreference();
  const { speed, setSpeed, ready } = useHexBattleSpeed();
  const preset = HEX_SPEED_PRESETS.find(
    (entry) => entry.speed.move === speed.move && entry.speed.attack === speed.attack && entry.speed.reaction === speed.reaction
  );
  return (
    <>
      <OptionRow
        icon={<Sparkles aria-hidden="true" />}
        title="Motion"
        detail="Reduced: no ambient battlefield animation, idle creature loops, screen bursts or looping effect videos."
      >
        <Segmented label="Motion" onChange={(motion) => setDisplayPreferences({ motion })} options={MOTION_OPTIONS} value={prefs.motion} />
      </OptionRow>
      <OptionRow
        icon={<Play aria-hidden="true" />}
        title="Play animations"
        detail="Off: dice, card flights, spell effects and reveals jump straight to the result. Reaction windows still wait for you."
      >
        <Switch checked={!skipAnimations} label="Play animations" onChange={(play) => setSkipAnimations(!play)} />
      </OptionRow>
      <div className="optionsGroup">
        <div className="optionsGroupHead">
          <span className="optionsRowTitle">
            <Gauge aria-hidden="true" />
            Hex battle speed
          </span>
          <Segmented
            label="Battle speed preset"
            onChange={(key) => {
              const chosen = HEX_SPEED_PRESETS.find((entry) => entry.key === key);
              if (chosen) setSpeed(chosen.speed);
            }}
            options={HEX_SPEED_PRESETS.map((entry) => ({ value: entry.key, label: entry.label, title: entry.title }))}
            value={ready && preset ? preset.key : ""}
          />
        </div>
        {SPEED_CHANNELS.map((channel) => {
          const steps = hexSpeedSteps(channel.key);
          const index = hexSpeedStepIndex(steps, speed[channel.key]);
          return (
            <label className="optionsSpeedRow" key={channel.key}>
              <span>{channel.label}</span>
              <input
                aria-label={`${channel.label} speed`}
                aria-valuetext={formatHexSpeed(speed[channel.key])}
                max={steps.length - 1}
                min={0}
                onChange={(event) => {
                  const step = steps[Number(event.currentTarget.value)];
                  if (step !== undefined) setSpeed({ [channel.key]: step });
                }}
                step={1}
                style={{ ["--fill" as string]: `${(index / Math.max(1, steps.length - 1)) * 100}%` }}
                type="range"
                value={index}
              />
              <output>{formatHexSpeed(speed[channel.key])}</output>
            </label>
          );
        })}
      </div>
    </>
  );
}

function TextTab() {
  const prefs = useDisplayPrefs();
  const { language, setLanguage } = useStoryLanguage();
  const coach = useHelperCoachPreference();
  return (
    <>
      <OptionRow icon={<Type aria-hidden="true" />} title="Story text size" detail="Dialogue, choices and the story log.">
        <Segmented
          label="Story text size"
          onChange={(storyTextScale) => setDisplayPreferences({ storyTextScale })}
          options={STORY_TEXT_SCALES.map((entry) => ({ value: entry.value, label: entry.label }))}
          value={prefs.storyTextScale}
        />
      </OptionRow>
      <p className="optionsTextPreview" style={{ fontSize: `${16 * prefs.storyTextScale}px` }}>
        “The gates of Erathia open before you, hero.”
      </p>
      <OptionRow icon={<Languages aria-hidden="true" />} title="Story language" detail="Campaign and story scenes.">
        <Segmented
          label="Story language"
          onChange={setLanguage}
          options={[
            { value: "en", label: "English" },
            { value: "vi", label: "Tiếng Việt" },
          ]}
          value={language}
        />
      </OptionRow>
      <OptionRow icon={<Lightbulb aria-hidden="true" />} title="Helper tips" detail="The coach that explains what to do next during a game.">
        <Switch
          checked={coach.enabled}
          label="Helper tips"
          onChange={(enabled) => coach.setPreference(enabled ? "on" : "off")}
        />
      </OptionRow>
    </>
  );
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

function useResetTab(tab: SettingsTab): () => void {
  const { recommended, setPreference } = useUiModePreference();
  const { setSkipAnimations } = useSkipAnimationsPreference();
  const { setSpeed } = useHexBattleSpeed();
  const { setLanguage } = useStoryLanguage();
  return useCallback(() => {
    if (tab === "audio") {
      setAudioMix(AUDIO_MIX_DEFAULTS);
      setMusicMuted(false);
      setSoundMuted(false);
    } else if (tab === "display") {
      setPreference(recommended);
      setDisplayPreferences({ keepAwake: DISPLAY_PREFERENCE_DEFAULTS.keepAwake });
    } else if (tab === "graphics") {
      setDisplayPreferences({ motion: DISPLAY_PREFERENCE_DEFAULTS.motion });
      setSkipAnimations(false);
      setSpeed(HEX_SPEED_DEFAULTS);
    } else {
      setDisplayPreferences({ storyTextScale: DISPLAY_PREFERENCE_DEFAULTS.storyTextScale });
      setLanguage("en");
    }
  }, [tab, recommended, setPreference, setSkipAnimations, setSpeed, setLanguage]);
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export default function SettingsDialog({ tab }: { tab: SettingsTab }) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const reset = useResetTab(tab);
  const active = TABS.find((entry) => entry.key === tab) ?? TABS[0];

  // Focus moves into the dialog on open and returns to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    return () => opener?.focus?.();
  }, []);

  // Keys are handled natively ON the dialog and never travel further, so the
  // table's own hotkeys (document / window listeners) cannot fire underneath
  // while a slider or button in here has focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettings();
        return;
      }
      if (event.key === "Tab") {
        const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.getAttribute("role") !== "tab") return;
      const delta =
        event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      const tabs = Array.from(dialog.querySelectorAll<HTMLElement>('[role="tab"]'));
      const index = (tabs.indexOf(target) + delta + TABS.length) % TABS.length;
      setSettingsTab(TABS[index].key);
      tabs[index]?.focus();
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => dialog.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className="optionsBackdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeSettings();
      }}
    >
      <section aria-labelledby={titleId} aria-modal="true" className="optionsDialog" ref={dialogRef} role="dialog">
        <header className="optionsHeader">
          <span className="optionsCrest" aria-hidden="true">
            <Settings />
          </span>
          <div>
            <h2 id={titleId}>Options</h2>
            <small>Saved on this device · applies instantly</small>
          </div>
          <button aria-label="Close options" className="optionsClose" onClick={closeSettings} type="button">
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="optionsBody">
          <div aria-label="Option categories" aria-orientation="vertical" className="optionsTabs" role="tablist">
            {TABS.map((entry) => (
              <button
                aria-controls={`${titleId}-panel`}
                aria-selected={entry.key === tab}
                className="optionsTab"
                key={entry.key}
                onClick={() => setSettingsTab(entry.key)}
                role="tab"
                tabIndex={entry.key === tab ? 0 : -1}
                type="button"
              >
                {entry.icon}
                <span>
                  {entry.label}
                  <small>{entry.hint}</small>
                </span>
              </button>
            ))}
          </div>
          <div aria-label={active.label} className="optionsPanel" id={`${titleId}-panel`} role="tabpanel">
            <h3 className="optionsPanelTitle">{active.label}</h3>
            {tab === "audio" ? <AudioTab /> : tab === "display" ? <DisplayTab /> : tab === "graphics" ? <GraphicsTab /> : <TextTab />}
          </div>
        </div>
        <footer className="optionsFooter">
          <button className="optionsSecondary" onClick={reset} title={`Restore the ${active.label} defaults`} type="button">
            <RotateCcw aria-hidden="true" /> Restore defaults
          </button>
          <button className="optionsPrimary" onClick={closeSettings} type="button">
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}
