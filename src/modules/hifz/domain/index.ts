/**
 * The ḥifẓ domain engines: pure, deterministic, and unable to reach the database.
 *
 * The shape of the module, in the order evidence travels:
 *
 *   exercises   — the ladder: which rung, how strong, what comes next
 *   grading     — the evidence gate: observations in, a grade or a refusal out
 *   stateMachine— the per-unit path; `verified` only through a human verdict
 *   mastery     — ear-gated levels, every rate with its denominator
 *   fluency     — pace and hesitation from measured latencies
 *   wordSync    — measured word timings; never interpolated
 *   reciteDiff  — advisory ASR comparison; never a grade
 *   weakJoins   — the seams that trail the āyāt they join
 *   sessionPlan — what fits in the time this learner actually has
 */
export * from "./exercises";
export * from "./fluency";
export * from "./grading";
export * from "./mastery";
export * from "./reciteDiff";
export * from "./sessionPlan";
export * from "./stateMachine";
export * from "./weakJoins";
export * from "./wordSync";
