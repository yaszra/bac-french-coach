/**
 * The hint control.
 *
 * Always visible, and always labelled with its consequence *before* it is
 * used. A learner who does not know that a hint changes what the attempt
 * counts as cannot make an honest choice about taking one.
 */
import { useLocale } from "../i18n/context.js";

export interface AssistanceControlProps {
  onUse: () => void;
  disabled?: boolean;
  /** True once assistance has been used in the current attempt. */
  used?: boolean;
}

export function AssistanceControl({
  onUse,
  disabled = false,
  used = false,
}: AssistanceControlProps) {
  const { t } = useLocale();
  return (
    <div className="athar-assistance">
      <button
        type="button"
        className="athar-assistance__button"
        onClick={onUse}
        disabled={disabled}
        aria-describedby="athar-assistance-consequence"
      >
        {t("session.needHint")}
      </button>
      <p className="athar-assistance__consequence" id="athar-assistance-consequence">
        {t("session.hintConsequence")}
      </p>
      {used ? (
        <p className="athar-assistance__used" role="status">
          {t("evidence.assisted")}
        </p>
      ) : null}
    </div>
  );
}
