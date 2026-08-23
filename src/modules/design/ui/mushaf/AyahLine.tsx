"use client";

import { Fragment, type KeyboardEvent } from "react";
import { InkWord } from "./InkWord";
import { AyahRosette } from "./AyahRosette";
import { wordKey, type MushafWord } from "./types";
import styles from "./MushafPage.module.css";

export type AyahLineProps = {
  readonly words: readonly MushafWord[];
  /**
   * Key (`${ayah}:${index}`) of the word that holds tabindex 0. When omitted
   * every word is tabbable — a line rendered on its own is still operable.
   */
  readonly activeKey?: string | undefined;
  readonly onWordSelect?: ((word: MushafWord) => void) | undefined;
  readonly onWordKeyDown?:
    | ((event: KeyboardEvent<HTMLButtonElement>, key: string) => void)
    | undefined;
  readonly registerWord?: ((key: string, element: HTMLButtonElement | null) => void) | undefined;
};

/**
 * One printed line of the muṣḥaf: words in muṣḥaf order, each āyah closed by
 * its rosette. `lang="ar"` and `dir="rtl"` are stated on the line itself — the
 * page is Arabic regardless of the language the interface speaks.
 */
export function AyahLine({
  words,
  activeKey,
  onWordSelect,
  onWordKeyDown,
  registerWord,
}: AyahLineProps) {
  return (
    <div className={styles.line} lang="ar" dir="rtl">
      {words.map((word) => {
        const key = wordKey(word);
        return (
          <Fragment key={key}>
            <InkWord
              text={word.text}
              depth={word.depth}
              ayah={word.ayah}
              index={word.index}
              state={word.state}
              revealed={word.revealed}
              tabIndex={activeKey === undefined || activeKey === key ? 0 : -1}
              ref={registerWord ? (element) => registerWord(key, element) : undefined}
              onSelect={onWordSelect ? () => onWordSelect(word) : undefined}
              onKeyDown={onWordKeyDown ? (event) => onWordKeyDown(event, key) : undefined}
            />
            {word.endsAyah ? <AyahRosette ayah={word.ayah} /> : null}
          </Fragment>
        );
      })}
    </div>
  );
}
