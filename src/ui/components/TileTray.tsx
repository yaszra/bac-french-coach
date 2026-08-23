/**
 * The word-tile tray.
 *
 * Sits *below* the page, never over it. Every drag interaction has a
 * keyboard equivalent — arrow keys move between tiles, Enter places one —
 * because a learner who cannot drag must still be able to complete the
 * loop, and a drag-only tray would exclude them from the product entirely.
 */
import { useRef, useState, type KeyboardEvent } from "react";
import { useLocale } from "../i18n/context.js";

export interface Tile {
  tokenId: string;
  text: string;
}

export interface TileTrayProps {
  tiles: readonly Tile[];
  onPlace: (tokenId: string) => void;
  disabled?: boolean;
}

export function TileTray({ tiles, onPlace, disabled = false }: TileTrayProps) {
  const { t } = useLocale();
  const [focusIndex, setFocusIndex] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (delta: number) => {
    if (tiles.length === 0) return;
    const next = (focusIndex + delta + tiles.length) % tiles.length;
    setFocusIndex(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The tray is right-to-left, so ArrowLeft advances and ArrowRight goes
    // back — matching what the learner sees, not the key's Latin name.
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        event.preventDefault();
        move(1);
        break;
      case "ArrowRight":
      case "ArrowUp":
        event.preventDefault();
        move(-1);
        break;
      case "Home":
        event.preventDefault();
        setFocusIndex(0);
        refs.current[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        setFocusIndex(tiles.length - 1);
        refs.current[tiles.length - 1]?.focus();
        break;
    }
  };

  return (
    <div className="athar-tray" dir="rtl">
      <h3 className="athar-tray__heading" id="athar-tray-heading">
        {t("session.tileTray")}
      </h3>
      <p className="athar-tray__help" id="athar-tray-help">
        {t("session.tileTrayHelp")}
      </p>
      <div
        className="athar-tray__tiles"
        role="listbox"
        aria-labelledby="athar-tray-heading"
        aria-describedby="athar-tray-help"
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
      >
        {tiles.map((tile, index) => (
          <button
            key={tile.tokenId}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="option"
            aria-selected={index === focusIndex}
            // Roving tabindex: one stop for the whole tray, then arrow keys.
            tabIndex={index === focusIndex ? 0 : -1}
            className="athar-tray__tile"
            data-token={tile.tokenId}
            disabled={disabled}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onPlace(tile.tokenId)}
          >
            {tile.text}
          </button>
        ))}
      </div>
    </div>
  );
}
