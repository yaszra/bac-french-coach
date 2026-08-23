/**
 * The learning-state badge.
 *
 * Carries a shape token as well as a colour token, because a colour-only
 * badge is unreadable for a teacher with a colour-vision difference and
 * meaningless in a printed report.
 */
import type { LearningState } from "../../core/types.js";
import { useLocale } from "../i18n/context.js";
import type { MessageKey } from "../i18n/messages.js";

/** Non-colour encoding, so meaning survives greyscale. */
const GLYPH: Record<LearningState, string> = {
  assigned: "○",
  preparing: "◐",
  recalled_independently: "◑",
  ready_for_verification: "◕",
  verified: "●",
  established: "◆",
  durable: "◆◆",
  fragile: "△",
  repairing: "⟳",
};

export function LearningStateBadge({ state }: { state: LearningState }) {
  const { t } = useLocale();
  const label = t(`state.${state}` as MessageKey);
  return (
    <span className="athar-badge" data-state={state}>
      <span className="athar-badge__glyph" aria-hidden="true">
        {GLYPH[state]}
      </span>
      <span className="athar-badge__label">{label}</span>
    </span>
  );
}
