"use client";

import { CloudSun, Dices } from "lucide-react";
import { BATTLEFIELD_CONDITIONS } from "@/data/battlefield-conditions";
import styles from "./battlefield-conditions-options.module.css";

/** Uses the same saved house-rule flag as the standard rules list. */
export function BattlefieldConditionsOptions({ enabled, onChange }: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  const face = (value: number) => value > 0 ? "+1" : value < 0 ? "−1" : "0";
  return (
    <section className={styles.card} aria-label="Battlefield conditions">
      <div className={styles.heading}>
        <CloudSun className={styles.icon} size={30} aria-hidden="true" />
        <div className={styles.title}>
          <span className={styles.eyebrow}>OPTIONAL COMBAT RULE</span>
          <strong>Battlefield conditions</strong>
          <p>Two dice. Nine conditions. A different atmosphere for every battle.</p>
        </div>
        <button type="button" role="switch" aria-checked={enabled}
          aria-label="Enable battlefield conditions" className={styles.toggle}
          onClick={() => onChange(!enabled)}>
          <span className={styles.switchTrack}><span /></span>
          {enabled ? "On" : "Off"}
        </button>
      </div>
      <div className={styles.explanation}>
        <Dices size={18} aria-hidden="true" />
        <p>At combat start, roll two independent −1 / 0 / +1 dice in order.
          Their pair chooses one condition for the entire battle. Both armies
          share its rule, animated atmosphere and sound.</p>
      </div>
      <details className={styles.details}>
        <summary>View all nine dice results <span>Each pair: 1 in 9</span></summary>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Die 1 / Die 2</th><th scope="col">Condition</th><th scope="col">Rule</th></tr></thead>
            <tbody>{BATTLEFIELD_CONDITIONS.map((condition) => (
              <tr key={condition.id}>
                <td className={styles.dice}>{face(condition.dice[0])} / {face(condition.dice[1])}</td>
                <th scope="row">{condition.name}</th>
                <td>{condition.summary}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
