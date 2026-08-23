/**
 * The verification workspace.
 *
 * Optimised for a teacher's ear and speed: four decisions on keys 1–4,
 * large touch targets, and no page transition between learners.
 *
 * Two things are deliberately absent: any score that could pressure the
 * teacher's judgement, and any automated recommendation of a decision.
 * The software's job here is to lay out evidence, not to lean.
 */
import { useEffect, useState } from "react";
import type { CorrectionCategory, VerificationDecision } from "../../core/types.js";
import { useLocale } from "../i18n/context.js";
import type { MessageKey } from "../i18n/messages.js";

export interface PriorCorrection {
  category: CorrectionCategory;
  addedAt: string;
  resolved: boolean;
}

export interface VerificationWorkspaceProps {
  learnerName: string;
  passageLabel: string;
  policyVersion: string;
  assignedBy: string;
  priorCorrections: readonly PriorCorrection[];
  cueHistory: { independent: number; assisted: number };
  /** Advisory only. Never a decision, never a score. */
  advisorySignal?: { region: string; confidence: "low" | "medium" | "high" };
  onDecide: (
    decision: VerificationDecision,
    corrections: readonly { category: CorrectionCategory; note?: string }[],
  ) => void;
}

const DECISIONS: readonly VerificationDecision[] = [
  "verified_cleanly",
  "verified_minor_slip",
  "practice_again",
  "unable_to_assess",
];

const CORRECTION_CATEGORIES: readonly CorrectionCategory[] = [
  "word_substitution",
  "omission",
  "insertion",
  "order",
  "join",
  "similar_ayah",
  "vowel",
  "letter",
  "makhraj",
  "madd",
  "ghunnah",
  "waqf_ibtida",
  "teacher_note",
];

export function VerificationWorkspace({
  learnerName,
  passageLabel,
  policyVersion,
  assignedBy,
  priorCorrections,
  cueHistory,
  advisorySignal,
  onDecide,
}: VerificationWorkspaceProps) {
  const { t } = useLocale();
  const [selected, setSelected] = useState<CorrectionCategory[]>([]);
  const [note, setNote] = useState("");

  // Keys 1-4 decide. Ignored while typing a note, so a teacher writing
  // "3 slips" does not accidentally file a decision.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      const index = Number.parseInt(event.key, 10) - 1;
      const decision = DECISIONS[index];
      if (decision) {
        event.preventDefault();
        onDecide(
          decision,
          selected.map((category) =>
            note.trim() ? { category, note: note.trim() } : { category },
          ),
        );
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecide, selected, note]);

  const toggle = (category: CorrectionCategory) =>
    setSelected((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    );

  return (
    <main className="athar-verify">
      <h1>{t("verify.heading")}</h1>
      <p className="athar-verify__context">
        {learnerName} · {passageLabel} · {policyVersion} · {assignedBy}
      </p>

      {/*
        Prior corrections come before any telemetry: what a teacher already
        told this learner matters more than what the software measured.
      */}
      <section aria-labelledby="athar-prior">
        <h2 id="athar-prior">{t("verify.priorCorrections")}</h2>
        {priorCorrections.length === 0 ? (
          <p>{t("evidence.notRecorded")}</p>
        ) : (
          <ul>
            {priorCorrections.map((c) => (
              <li key={`${c.category}:${c.addedAt}`} data-resolved={c.resolved}>
                {c.category} · {c.addedAt}
                {c.resolved ? "" : " · unresolved"}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="athar-cues">
        <h2 id="athar-cues">{t("verify.cueHistory")}</h2>
        <p>
          {t("evidence.independent")}: {cueHistory.independent} ·{" "}
          {t("evidence.assisted")}: {cueHistory.assisted}
        </p>
      </section>

      {advisorySignal ? (
        <section aria-labelledby="athar-advisory">
          <h2 id="athar-advisory">{t("verify.advisorySignal")}</h2>
          <p>
            {advisorySignal.region} ·{" "}
            {t("teach.confidence", {
              level: t(`teach.confidence.${advisorySignal.confidence}` as MessageKey),
            })}
          </p>
          {/* The caveat is not fine print; it sits with the signal. */}
          <p className="athar-verify__caveat">{t("verify.advisoryCaveat")}</p>
        </section>
      ) : null}

      <section aria-labelledby="athar-corrections">
        <h2 id="athar-corrections">{t("verify.addCorrection")}</h2>
        <div className="athar-verify__categories" role="group" aria-labelledby="athar-corrections">
          {CORRECTION_CATEGORIES.map((category) => (
            <label key={category} className="athar-verify__category">
              <input
                type="checkbox"
                checked={selected.includes(category)}
                onChange={() => toggle(category)}
              />
              {category}
            </label>
          ))}
        </div>
        <label className="athar-verify__note">
          {t("verify.note")}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>

      <section aria-labelledby="athar-decision">
        <h2 id="athar-decision">{t("verify.decision")}</h2>
        <div className="athar-verify__decisions" role="group" aria-labelledby="athar-decision">
          {DECISIONS.map((decision, index) => (
            <button
              key={decision}
              type="button"
              className="athar-verify__decision"
              data-decision={decision}
              // The shortcut is on the label, so it is discoverable rather
              // than something a teacher has to be told about.
              aria-keyshortcuts={String(index + 1)}
              onClick={() =>
                onDecide(
                  decision,
                  selected.map((category) =>
                    note.trim() ? { category, note: note.trim() } : { category },
                  ),
                )
              }
            >
              <span aria-hidden="true">{index + 1}</span>{" "}
              {t(`verify.${decision}` as MessageKey)}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
