/**
 * The scaffold ladder indicator.
 *
 * Cue withdrawal is announced in words, never silent. A learner who finds
 * the task suddenly harder without being told why reads it as their own
 * failure.
 */
import { SCAFFOLD_LADDER, type ScaffoldLevel } from "../../core/types.js";
import { useLocale } from "../i18n/context.js";
import type { MessageKey } from "../i18n/messages.js";

export interface ScaffoldLadderProps {
  level: ScaffoldLevel;
  /** Set when the level just moved, so the change can be announced. */
  lastChange?: "advanced" | "retreated" | "held";
}

export function ScaffoldLadder({ level, lastChange }: ScaffoldLadderProps) {
  const { t } = useLocale();
  const index = SCAFFOLD_LADDER.indexOf(level);

  return (
    <div className="athar-ladder">
      <ol className="athar-ladder__rungs">
        {SCAFFOLD_LADDER.map((rung, i) => (
          <li
            key={rung}
            className="athar-ladder__rung"
            data-rung={rung}
            data-state={i < index ? "passed" : i === index ? "current" : "ahead"}
            aria-current={i === index ? "step" : undefined}
          >
            {t(`scaffold.${rung}` as MessageKey)}
          </li>
        ))}
      </ol>
      {/*
        Polite, not assertive: the change matters but must not interrupt a
        learner mid-recall.
      */}
      <p className="athar-ladder__change" role="status" aria-live="polite">
        {lastChange && lastChange !== "held"
          ? t(`scaffold.${lastChange}` as MessageKey)
          : ""}
      </p>
    </div>
  );
}
