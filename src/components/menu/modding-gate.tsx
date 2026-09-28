"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wrench } from "lucide-react";
import { isRestiaUnlocked, unlockRestia } from "@/restia/gate";
import css from "./modding-gate.module.css";

/**
 * Main-menu corner icon for experimental mods. Opens a password prompt; the
 * right password leads to the Restia single-player mode (/restia). Imports only
 * the tiny gate helper, so the game itself stays out of the menu bundle.
 */
export function ModdingGate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [wrong, setWrong] = useState(0);
  return (
    <>
      <button
        aria-label="Modding"
        className={css.trigger}
        onClick={() => {
          if (isRestiaUnlocked()) router.push("/restia");
          else setOpen(true);
        }}
        title="Modding"
        type="button"
      >
        <Wrench aria-hidden size={18} />
      </button>
      {open ? (
        <div className={css.backdrop} onClick={() => setOpen(false)}>
          <form
            aria-label="Modding password"
            className={`${css.box} ${wrong ? css.shake : ""}`}
            key={wrong}
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              if (unlockRestia(value)) {
                setOpen(false);
                router.push("/restia");
              } else {
                setWrong((n) => n + 1);
              }
            }}
          >
            <h2 className={css.title}>Modding</h2>
            <p className={css.text}>Experimental mods are locked. Enter the password.</p>
            <input
              autoFocus
              className={css.input}
              inputMode="numeric"
              onChange={(event) => setValue(event.target.value)}
              placeholder="••••"
              type="password"
              value={value}
            />
            {wrong ? <p className={css.error}>Wrong password.</p> : null}
            <div className={css.actions}>
              <button className={css.primary} type="submit">
                Unlock
              </button>
              <button className={css.secondary} onClick={() => setOpen(false)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
