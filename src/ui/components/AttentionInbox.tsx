/**
 * The teacher's attention inbox.
 *
 * An ordered list of things to do, not a dashboard. Each row shows its
 * evidence, its confidence, and one action — which is the whole difference
 * between a screen that informs and a screen that decides.
 */
import type { AttentionInbox as Inbox, AttentionRow } from "../../core/attention.js";
import { useLocale } from "../i18n/context.js";
import type { MessageKey } from "../i18n/messages.js";
import { EmptyState } from "./RouteStates.js";

export interface AttentionInboxProps {
  inbox: Inbox;
  onAct: (row: AttentionRow) => void;
}

function Row({ row, onAct }: { row: AttentionRow; onAct: (r: AttentionRow) => void }) {
  const { t } = useLocale();
  return (
    <li className="athar-attention__row" data-category={row.category}>
      <p className="athar-attention__learner">{row.learnerName}</p>
      <p className="athar-attention__headline">{row.headline}</p>

      {/* Evidence is always on the row, never behind a disclosure. */}
      <ul className="athar-attention__evidence" aria-label={t("teach.evidence")}>
        {row.evidence.map((e) => (
          <li key={e.statement}>{e.statement}</li>
        ))}
      </ul>

      {/*
        Confidence is stated in words. A teacher deciding how much weight to
        give a claim needs to know how well-supported it is.
      */}
      <p className="athar-attention__confidence" data-confidence={row.confidence}>
        {t("teach.confidence", {
          level: t(`teach.confidence.${row.confidence}` as MessageKey),
        })}
      </p>

      <button
        type="button"
        className="athar-attention__action"
        onClick={() => onAct(row)}
      >
        {row.action.label}
      </button>
    </li>
  );
}

export function AttentionInbox({ inbox, onAct }: AttentionInboxProps) {
  const { t } = useLocale();

  if (inbox.rows.length === 0)
    return (
      <main className="athar-attention">
        <h1>{t("teach.attention")}</h1>
        <EmptyState heading={t("teach.emptyInbox")} />
      </main>
    );

  // Group in the engine's order; the engine already sorted, so grouping
  // here must not re-sort or the documented priority would be lost.
  const groups: { category: AttentionRow["category"]; rows: AttentionRow[] }[] = [];
  for (const row of inbox.rows) {
    const last = groups.at(-1);
    if (last && last.category === row.category) last.rows.push(row);
    else groups.push({ category: row.category, rows: [row] });
  }

  return (
    <main className="athar-attention">
      <h1>{t("teach.attention")}</h1>
      {groups.map((group) => (
        <section key={group.category} aria-labelledby={`athar-group-${group.category}`}>
          <h2 id={`athar-group-${group.category}`}>
            {t(`teach.${group.category}` as MessageKey)}{" "}
            <span className="athar-attention__count">
              ({inbox.counts[group.category]})
            </span>
          </h2>
          <ul className="athar-attention__rows">
            {group.rows.map((row) => (
              <Row key={`${row.category}:${row.learnerId}`} row={row} onAct={onAct} />
            ))}
          </ul>
        </section>
      ))}
      {inbox.cappedNotice ? (
        <p className="athar-attention__capped" role="status">
          {inbox.cappedNotice}
        </p>
      ) : null}
    </main>
  );
}
