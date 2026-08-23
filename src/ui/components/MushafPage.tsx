"use client";

/* Rendered inside the locale provider. */

/**
 * The muṣḥaf page.
 *
 * Three rules govern this component, and each has a test named after it:
 *
 *  1. Line geometry is invariant. The page always renders the same number
 *     of lines and the same slots in the same positions, whatever the UI
 *     locale, theme, or how much the learner has recalled. A word appearing
 *     must never move the words around it.
 *  2. It begins blank, and words appear only where evidence put them.
 *  3. Qur'anic text is always right-to-left and always on warm paper, even
 *     when the surrounding interface is left-to-right or dark.
 */
import { linesOnPage } from "../tokens.js";

export interface RenderableToken {
  /** Layout token id from the approved corpus. */
  tokenId: string;
  positionInLine: number;
  /**
   * The verified Uthmani token. Rendered only when revealed; the slot
   * reserves its space either way, which is what keeps geometry fixed.
   */
  text: string;
  /**
   * Relative width of this token, measured from the approved layout. Blank
   * slots use it to hold the exact space the word will occupy.
   */
  widthUnits: number;
}

export interface RenderableLine {
  lineNumber: number;
  tokens: readonly RenderableToken[];
}

export interface MushafPageProps {
  pageNumber: number;
  lines: readonly RenderableLine[];
  /** Layout token ids the learner has actually recalled this session. */
  revealedTokenIds: readonly string[];
  /** Accessible name for the page region. */
  label: string;
}

export function MushafPage({
  pageNumber,
  lines,
  revealedTokenIds,
  label,
}: MushafPageProps) {
  const revealed = new Set(revealedTokenIds);
  const lineCount = linesOnPage(pageNumber);
  const byNumber = new Map(lines.map((l) => [l.lineNumber, l]));

  // Every line is rendered whether or not it carries tokens: the page's
  // shape is a property of the printed muṣḥaf, not of the data we happen
  // to have loaded.
  const allLines = Array.from({ length: lineCount }, (_, i) => {
    const lineNumber = i + 1;
    return byNumber.get(lineNumber) ?? { lineNumber, tokens: [] };
  });

  const total = lines.reduce((n, l) => n + l.tokens.length, 0);
  const shown = lines.reduce(
    (n, l) => n + l.tokens.filter((t) => revealed.has(t.tokenId)).length,
    0,
  );

  return (
    <div
      className="athar-mushaf"
      // Qur'anic text is right-to-left regardless of interface locale.
      dir="rtl"
      role="region"
      aria-label={label}
      data-page={pageNumber}
      data-line-count={lineCount}
    >
      {/*
        The live region announces progress without reading the text aloud
        on every placement, which would be unusable with a screen reader.
      */}
      <p className="athar-visually-hidden" aria-live="polite" aria-atomic="true">
        {`${shown} / ${total}`}
      </p>
      <ol className="athar-mushaf__lines">
        {allLines.map((line) => (
          <li
            key={line.lineNumber}
            className="athar-mushaf__line"
            data-line={line.lineNumber}
          >
            {line.tokens.map((token) => {
              const isRevealed = revealed.has(token.tokenId);
              return (
                <span
                  key={token.tokenId}
                  className="athar-mushaf__slot"
                  data-token={token.tokenId}
                  data-position={token.positionInLine}
                  data-revealed={isRevealed}
                  // The slot holds its width whether filled or not.
                  style={{ flexBasis: `${token.widthUnits}ch` }}
                >
                  {isRevealed ? (
                    <span className="athar-mushaf__word">{token.text}</span>
                  ) : (
                    // Empty slots are skipped by assistive technology:
                    // announcing fifteen lines of blanks helps nobody.
                    <span className="athar-mushaf__blank" aria-hidden="true" />
                  )}
                </span>
              );
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}
