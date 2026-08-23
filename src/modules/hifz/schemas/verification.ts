/**
 * Human verification, validated at the boundary.
 *
 * A verdict is the only evidence that can verify a unit, so its shape is guarded
 * closely: `verifiedBy` is required and non-empty, because a verdict with nobody
 * attached to it is not a verdict. The server fills `verifiedBy` and `at` from the
 * authenticated session and its own clock — a client may not supply either, which is
 * why `verdictSubmissionSchema` (what a client sends) omits both.
 */

import { z } from "zod";
import { VERDICT_OUTCOMES } from "../domain/stateMachine";
import type { HumanVerdict } from "../domain/stateMachine";
import { unitIdSchema } from "./evidence";

export const verdictOutcomeSchema = z.enum(VERDICT_OUTCOMES);

/** What the teacher's client sends: a unit and a judgement, nothing else. */
export const verdictSubmissionSchema = z.strictObject({
  unitId: unitIdSchema,
  outcome: verdictOutcomeSchema,
});

export type VerdictSubmission = z.infer<typeof verdictSubmissionSchema>;

/** The complete verdict, after the server has attached the person and the time. */
export const humanVerdictSchema = z.strictObject({
  unitId: unitIdSchema,
  outcome: verdictOutcomeSchema,
  at: z.date(),
  verifiedBy: z.string().min(1).max(64),
});

/** A learner or teacher asking for the ear. The server decides whether it is allowed. */
export const verificationRequestSchema = z.strictObject({
  unitId: unitIdSchema,
});

type Assert<Expected, Actual extends Expected> = Actual;

export type VerdictMatchesDomain = Assert<HumanVerdict, z.infer<typeof humanVerdictSchema>>;
export type DomainMatchesVerdict = Assert<z.infer<typeof humanVerdictSchema>, HumanVerdict>;
