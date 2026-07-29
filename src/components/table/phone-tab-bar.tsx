"use client";

/**
 * Bottom tab bar for the phone UI mode.
 *
 * Pure presentation: which regions each tab reveals is decided by the
 * `.phoneMode[data-phone-tab="…"]` CSS on the table root — this bar only
 * renders the buttons and reports the pick. Badges surface counts (hand size)
 * and `attention` pulses a tab whose panel holds a blocking step (e.g. the
 * mandatory start-of-turn hand draw), so a gate can never sit invisible behind
 * an inactive tab.
 */
import type { ReactNode } from "react";

export type PhoneTab = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** A direct thumb action rather than a panel selector (for example End turn). */
  action?: boolean;
  /** Small count bubble (hand size, morale cards…). Hidden when undefined. */
  badge?: number | string;
  /** Pulse this tab — something in its panel needs the player. */
  attention?: boolean;
  /** Short chip naming what needs attention (e.g. "Draw!"). */
  attentionLabel?: string;
};

export function PhoneTabBar({
  tabs,
  active,
  onSelect,
  label = "Screen panels"
}: {
  tabs: PhoneTab[];
  active: string;
  onSelect: (id: string) => void;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="phoneTabBar" role="tablist">
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            aria-selected={selected}
            className={`phoneTab ${selected ? "active" : ""} ${tab.attention ? "attention" : ""} ${tab.action ? "action" : ""}`}
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            role="tab"
            type="button"
          >
            <span aria-hidden="true" className="phoneTabIcon">
              {tab.icon}
            </span>
            <span className="phoneTabLabel">{tab.label}</span>
            {tab.badge !== undefined ? <span className="phoneTabBadge">{tab.badge}</span> : null}
            {tab.attention && tab.attentionLabel ? (
              <span className="phoneTabAttention">{tab.attentionLabel}</span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
