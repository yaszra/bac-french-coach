"use client";

/* Holds wizard step state and the draft assignment. */

/**
 * The assignment wizard.
 *
 * Four steps: Who, What, Evidence policy, Review. Only the first two and
 * the last are ordinarily visible — the evidence policy arrives with
 * sensible defaults behind "Adjust evidence", because a teacher setting
 * homework should not have to reason about non-serial recall counts.
 *
 * Nothing here is editable by the learner afterwards. Unit size, listens,
 * cue policy, verification policy, and due date are adult decisions.
 */
import { useState } from "react";
import type { MemoryTargetKind } from "../../core/types.js";
import {
  defaultPolicy,
  validatePolicy,
  type PolicyDefaults,
} from "../../core/assignment-policy.js";

export interface WizardLearner {
  learnerId: string;
  displayName: string;
}

export interface WizardPassage {
  passageId: string;
  label: string;
  ayahCount: number;
  released: boolean;
  /** Why it cannot be assigned, shown rather than hidden. */
  releaseBlocks: readonly string[];
}

export interface AssignmentDraft {
  learnerIds: readonly string[];
  passageId: string;
  targetKind: MemoryTargetKind;
  policy: PolicyDefaults;
  dueInDays: number;
}

export interface AssignmentWizardProps {
  learners: readonly WizardLearner[];
  passages: readonly WizardPassage[];
  onAssign: (draft: AssignmentDraft) => void;
}

const STEPS = ["who", "what", "evidence", "review"] as const;
type Step = (typeof STEPS)[number];

const STEP_LABEL: Record<Step, string> = {
  who: "Who",
  what: "What",
  evidence: "Evidence policy",
  review: "Review and assign",
};

export function AssignmentWizard({
  learners,
  passages,
  onAssign,
}: AssignmentWizardProps) {
  const [step, setStep] = useState<Step>("who");
  const [learnerIds, setLearnerIds] = useState<string[]>([]);
  const [passageId, setPassageId] = useState<string>("");
  const [targetKind, setTargetKind] = useState<MemoryTargetKind>("segment");
  const [policyTouched, setPolicyTouched] = useState(false);
  const [policy, setPolicy] = useState<PolicyDefaults>(defaultPolicy("segment", 1));
  const [dueInDays, setDueInDays] = useState(1);

  const passage = passages.find((p) => p.passageId === passageId);

  // Until a teacher touches the policy it tracks the defaults for what
  // they picked, so choosing a longer passage does not silently keep a
  // policy sized for a shorter one.
  const choosePassage = (id: string) => {
    setPassageId(id);
    const next = passages.find((p) => p.passageId === id);
    if (!policyTouched && next) setPolicy(defaultPolicy(targetKind, next.ayahCount));
  };

  const chooseKind = (kind: MemoryTargetKind) => {
    setTargetKind(kind);
    if (!policyTouched)
      setPolicy(defaultPolicy(kind, passage?.ayahCount ?? 1));
  };

  const issues = validatePolicy({
    requiredListens: policy.requiredListens,
    requiredIndependentRecalls: policy.requiredIndependentRecalls,
    requiredNonSerialRecalls: policy.requiredNonSerialRecalls,
  });

  const canContinue =
    step === "who"
      ? learnerIds.length > 0
      : step === "what"
        ? passage !== undefined && passage.released
        : issues.length === 0;

  const index = STEPS.indexOf(step);

  return (
    <main className="athar-wizard">
      <h1>Assign</h1>
      <ol className="athar-wizard__steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            data-state={i < index ? "done" : i === index ? "current" : "ahead"}
            aria-current={i === index ? "step" : undefined}
          >
            {STEP_LABEL[s]}
          </li>
        ))}
      </ol>

      {step === "who" ? (
        <fieldset>
          <legend>Who</legend>
          {learners.map((learner) => (
            <label key={learner.learnerId}>
              <input
                type="checkbox"
                checked={learnerIds.includes(learner.learnerId)}
                onChange={() =>
                  setLearnerIds((current) =>
                    current.includes(learner.learnerId)
                      ? current.filter((id) => id !== learner.learnerId)
                      : [...current, learner.learnerId],
                  )
                }
              />
              {learner.displayName}
            </label>
          ))}
        </fieldset>
      ) : null}

      {step === "what" ? (
        <fieldset>
          <legend>What</legend>
          {passages.map((p) => (
            <label key={p.passageId}>
              <input
                type="radio"
                name="passage"
                value={p.passageId}
                checked={passageId === p.passageId}
                disabled={!p.released}
                onChange={() => choosePassage(p.passageId)}
              />
              {p.label}
              {/*
                An unreleasable passage is shown with its reason rather
                than hidden: a teacher who cannot find a passage will ask
                why, and the answer should already be on screen.
              */}
              {!p.released ? (
                <span className="athar-wizard__blocked">
                  {" — not available: "}
                  {p.releaseBlocks.join(", ") || "no approval recorded"}
                </span>
              ) : null}
            </label>
          ))}

          <label>
            Kind
            <select
              value={targetKind}
              onChange={(e) => chooseKind(e.target.value as MemoryTargetKind)}
            >
              <option value="segment">Passage</option>
              <option value="connection_boundary">Join into the next passage</option>
              <option value="similar_ayah_contrast">Similar āyāt</option>
            </select>
          </label>
        </fieldset>
      ) : null}

      {step === "evidence" ? (
        <fieldset>
          <legend>Evidence policy</legend>
          <p className="athar-wizard__hint">
            These defaults suit most learners. Change them only when you have
            a reason to.
          </p>
          <label>
            Required listens
            <input
              type="number"
              min={0}
              value={policy.requiredListens}
              onChange={(e) => {
                setPolicyTouched(true);
                setPolicy({ ...policy, requiredListens: Number(e.target.value) });
              }}
            />
          </label>
          <label>
            Cue-free recalls
            <input
              type="number"
              min={1}
              value={policy.requiredIndependentRecalls}
              onChange={(e) => {
                setPolicyTouched(true);
                setPolicy({
                  ...policy,
                  requiredIndependentRecalls: Number(e.target.value),
                });
              }}
            />
          </label>
          <label>
            Of those, from a random start or a join
            <input
              type="number"
              min={0}
              value={policy.requiredNonSerialRecalls}
              onChange={(e) => {
                setPolicyTouched(true);
                setPolicy({
                  ...policy,
                  requiredNonSerialRecalls: Number(e.target.value),
                });
              }}
            />
          </label>
          {issues.length > 0 ? (
            <ul className="athar-wizard__issues" role="alert">
              {issues.map((i) => (
                <li key={i.issue}>{i.message}</li>
              ))}
            </ul>
          ) : null}
        </fieldset>
      ) : null}

      {step === "review" ? (
        <section aria-labelledby="athar-wizard-review">
          <h2 id="athar-wizard-review">Review and assign</h2>
          <dl>
            <dt>Learners</dt>
            <dd>
              {learnerIds
                .map(
                  (id) =>
                    learners.find((l) => l.learnerId === id)?.displayName ?? id,
                )
                .join(", ")}
            </dd>
            <dt>Passage</dt>
            <dd>{passage?.label ?? "—"}</dd>
            <dt>Evidence</dt>
            <dd>
              {policy.requiredListens} listens, {policy.requiredIndependentRecalls}{" "}
              cue-free recalls, {policy.requiredNonSerialRecalls} from a random
              start or join
            </dd>
            <dt>Due</dt>
            <dd>in {dueInDays} {dueInDays === 1 ? "day" : "days"}</dd>
          </dl>
          <label>
            Due in days
            <input
              type="number"
              min={1}
              value={dueInDays}
              onChange={(e) => setDueInDays(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() =>
              onAssign({
                learnerIds,
                passageId,
                targetKind,
                policy,
                dueInDays,
              })
            }
            disabled={learnerIds.length === 0 || !passage?.released}
          >
            Assign
          </button>
        </section>
      ) : null}

      <nav className="athar-wizard__nav">
        <button
          type="button"
          onClick={() => setStep(STEPS[Math.max(0, index - 1)]!)}
          disabled={index === 0}
        >
          Back
        </button>
        {step === "what" ? (
          // The policy step is reachable but not on the default path.
          <button type="button" onClick={() => setStep("evidence")}>
            Adjust evidence
          </button>
        ) : null}
        <button
          type="button"
          onClick={() =>
            setStep(step === "what" ? "review" : STEPS[Math.min(STEPS.length - 1, index + 1)]!)
          }
          disabled={!canContinue || step === "review"}
        >
          Continue
        </button>
      </nav>
    </main>
  );
}
