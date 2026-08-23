"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSurface } from "../../theme/ThemeProvider";
import { AyahLine } from "./AyahLine";
import { wordKey, type MushafLine, type MushafWord } from "./types";
import styles from "./MushafPage.module.css";

export type MushafPageProps = {
  /** Line descriptors from the layout file; the words carry text + depth. */
  readonly lines: readonly MushafLine[];
  readonly onWordSelect?: ((word: MushafWord) => void) | undefined;
  /** Word (`${ayah}:${index}`) that should hold the tab stop first. */
  readonly initialFocusKey?: string | undefined;
};

type Position = { readonly line: number; readonly col: number; readonly flat: number };

/**
 * A muṣḥaf page: lines of words laid out with the fixed page metrics.
 *
 * Keyboard: one tab stop for the whole page (roving tabindex). Arrows move by
 * word in the page's own reading direction — the muṣḥaf is right-to-left in
 * every locale, so ArrowLeft advances and ArrowRight goes back. ArrowUp/Down
 * move between lines, Home/End jump to the ends of the line, and Ctrl/Cmd
 * with Home/End to the ends of the page.
 */
export function MushafPage({ lines, onWordSelect, initialFocusKey }: MushafPageProps) {
  const { t } = useSurface();
  const elements = useRef(new Map<string, HTMLButtonElement>());
  const [focusedKey, setFocusedKey] = useState<string | null>(initialFocusKey ?? null);

  const map = useMemo(() => {
    const positions = new Map<string, Position>();
    const flat: string[] = [];
    const byLine: string[][] = [];
    lines.forEach((line, lineIndex) => {
      const keys: string[] = [];
      line.words.forEach((word, col) => {
        const key = wordKey(word);
        positions.set(key, { line: lineIndex, col, flat: flat.length });
        flat.push(key);
        keys.push(key);
      });
      byLine.push(keys);
    });
    return { positions, flat, byLine };
  }, [lines]);

  const activeKey =
    focusedKey !== null && map.positions.has(focusedKey) ? focusedKey : (map.flat[0] ?? undefined);

  const registerWord = useCallback((key: string, element: HTMLButtonElement | null) => {
    if (element) elements.current.set(key, element);
    else elements.current.delete(key);
  }, []);

  const moveTo = useCallback((key: string | undefined) => {
    if (key === undefined) return false;
    setFocusedKey(key);
    elements.current.get(key)?.focus();
    return true;
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, key: string) => {
      const position = map.positions.get(key);
      if (!position) return;

      const stepFlat = (delta: number): string | undefined => map.flat[position.flat + delta];
      const stepLine = (delta: number): string | undefined => {
        const line = map.byLine[position.line + delta];
        if (!line || line.length === 0) return undefined;
        return line[Math.min(position.col, line.length - 1)];
      };
      const jump = (toEnd: boolean): string | undefined => {
        if (event.ctrlKey || event.metaKey) {
          return toEnd ? map.flat[map.flat.length - 1] : map.flat[0];
        }
        const line = map.byLine[position.line];
        if (!line || line.length === 0) return undefined;
        return toEnd ? line[line.length - 1] : line[0];
      };

      let target: string | undefined;
      switch (event.key) {
        /* The page is right-to-left: leftwards is forwards. */
        case "ArrowLeft":
          target = stepFlat(1);
          break;
        case "ArrowRight":
          target = stepFlat(-1);
          break;
        case "ArrowDown":
          target = stepLine(1);
          break;
        case "ArrowUp":
          target = stepLine(-1);
          break;
        case "Home":
          target = jump(false);
          break;
        case "End":
          target = jump(true);
          break;
        default:
          return;
      }

      if (moveTo(target)) event.preventDefault();
    },
    [map, moveTo],
  );

  if (lines.length === 0) {
    /* Honesty rule: an unrecorded page says so. It is never filled in. */
    return <p className={styles.empty}>{t("state.notYetRecorded")}</p>;
  }

  return (
    <div className={styles.page}>
      {lines.map((line, index) => (
        <AyahLine
          key={line.id ?? `line-${index}`}
          words={line.words}
          activeKey={activeKey}
          onWordSelect={onWordSelect}
          onWordKeyDown={handleKeyDown}
          registerWord={registerWord}
        />
      ))}
    </div>
  );
}
