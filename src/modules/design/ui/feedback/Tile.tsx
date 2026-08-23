"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type Ref,
} from "react";
import { useSurface } from "../../theme/ThemeProvider";
import styles from "./Tile.module.css";

export type TileState = "default" | "placed" | "wrong" | "disabled";
export type TileDirection = "forward" | "backward";

export type TileProps = {
  /** The word, from the content package. This component never authors Arabic. */
  readonly text: string;
  readonly lang?: "ar" | "en" | undefined;
  readonly state?: TileState | undefined;
  /** Controlled pick-up state. Omit to let the tile hold its own. */
  readonly picked?: boolean | undefined;
  /** 1-based position in the line being rebuilt. */
  readonly slot?: number | undefined;
  readonly ayah?: number | undefined;
  readonly draggable?: boolean | undefined;
  readonly onPickUp?: (() => void) | undefined;
  readonly onPlace?: (() => void) | undefined;
  readonly onCancel?: (() => void) | undefined;
  readonly onMove?: ((direction: TileDirection) => void) | undefined;
  /** Pointer tap. Keyboard uses the pick-up / place flow instead. */
  readonly onSelect?: (() => void) | undefined;
  /** Mirror of every announcement, for a shared live region. */
  readonly onAnnounce?: ((message: string) => void) | undefined;
  readonly onDragStart?: ((event: DragEvent<HTMLButtonElement>) => void) | undefined;
  readonly ref?: Ref<HTMLButtonElement> | undefined;
};

/**
 * A word tile for the rebuild exercise.
 *
 * Pointer: tap to select, or drag if the caller enables it.
 * Keyboard: Enter/Space picks up, Arrows move, Enter/Space places, Escape
 * cancels. There is no `aria-grabbed` (deprecated) — the tile reports its
 * pick-up state with `aria-pressed` and narrates every move through a polite
 * live region.
 *
 * The tap floor is `--tap-min`, which is 56px for children by token.
 */
export function Tile({
  text,
  lang = "ar",
  state = "default",
  picked: pickedProp,
  slot,
  ayah,
  draggable,
  onPickUp,
  onPlace,
  onCancel,
  onMove,
  onSelect,
  onAnnounce,
  onDragStart,
  ref,
}: TileProps) {
  const { t, dir } = useSurface();
  const [internalPicked, setInternalPicked] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const picked = pickedProp ?? internalPicked;
  const disabled = state === "disabled";

  /* Position is the honest thing to announce: which word, and where it is. */
  const position = slot !== undefined && ayah !== undefined
    ? t("a11y.wordInAyah", { index: slot, ayah })
    : text;

  const announce = useCallback(
    (message: string) => {
      setAnnouncement(message);
      onAnnounce?.(message);
    },
    [onAnnounce],
  );

  const setPicked = useCallback(
    (next: boolean) => {
      if (pickedProp === undefined) setInternalPicked(next);
    },
    [pickedProp],
  );

  /* A tile that moved while held says where it landed. */
  const previousSlot = useRef(slot);
  useEffect(() => {
    if (previousSlot.current === slot) return;
    previousSlot.current = slot;
    if (picked) announce(position);
  }, [slot, picked, position, announce]);

  /* A tile the server marked wrong invites another try — it never scolds. */
  const previousState = useRef(state);
  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    if (state === "wrong") announce(t("action.retry"));
  }, [state, announce, t]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (picked) {
        setPicked(false);
        onPlace?.();
      } else {
        setPicked(true);
        onPickUp?.();
      }
      announce(position);
      return;
    }

    if (event.key === "Escape" && picked) {
      event.preventDefault();
      setPicked(false);
      onCancel?.();
      announce(t("action.cancel"));
      return;
    }

    if (!picked) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
      onMove?.(event.key === forward || event.key === "ArrowDown" ? "forward" : "backward");
    }
  };

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", text);
    setPicked(true);
    onPickUp?.();
    onDragStart?.(event);
  };

  return (
    <span className={styles.slot}>
      <button
        ref={ref}
        type="button"
        className={styles.tile}
        lang={lang}
        dir={lang === "ar" ? "rtl" : "ltr"}
        data-state={state}
        data-picked={picked ? "true" : undefined}
        aria-pressed={picked}
        disabled={disabled}
        draggable={draggable}
        onClick={onSelect}
        onKeyDown={handleKeyDown}
        onDragStart={draggable ? handleDragStart : undefined}
      >
        {text}
      </button>
      <span className={styles.srOnly} aria-live="polite">
        {announcement}
      </span>
    </span>
  );
}
