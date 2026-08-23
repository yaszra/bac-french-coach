/**
 * A number that refuses to be shown without its denominator.
 *
 * The component takes a count and a total, not a percentage, so there is no
 * way to render "68%" without also rendering what it is 68% of. Where a
 * value genuinely is not known, an explicit reason is required — "not
 * recorded" is a designed state, never a blank or a zero.
 */
import { useLocale } from "../i18n/context.js";
import type { MessageKey } from "../i18n/messages.js";

export type MissingReason =
  | "notRecorded"
  | "notReviewed"
  | "insufficient"
  | "engineUnavailable";

export type HonestMetricProps =
  | { label: string; count: number; total: number; missing?: never }
  | { label: string; missing: MissingReason; count?: never; total?: never };

const MISSING_KEYS: Record<MissingReason, MessageKey> = {
  notRecorded: "evidence.notRecorded",
  notReviewed: "evidence.notReviewed",
  insufficient: "evidence.insufficient",
  engineUnavailable: "evidence.engineUnavailable",
};

export function HonestMetric(props: HonestMetricProps) {
  const { t } = useLocale();

  if (props.missing !== undefined)
    return (
      <p className="athar-metric" data-missing={props.missing}>
        <span className="athar-metric__label">{props.label}</span>
        <span className="athar-metric__value">{t(MISSING_KEYS[props.missing])}</span>
      </p>
    );

  const { count, total } = props;
  return (
    <p className="athar-metric">
      <span className="athar-metric__label">{props.label}</span>
      <span className="athar-metric__value">
        {t("evidence.ofTotal", { count, total })}
      </span>
    </p>
  );
}
