/**
 * Reading (Qāʿidah) — pure domain layer.
 *
 * No I/O, no database, no React, no clock and no randomness: every function here is a
 * function of its arguments, and every date comes in from the caller.
 *
 * - `concepts`      — the concept lattice: letters, forms, ḥarakāt, makhārij, marks,
 *                     madd, tajwīd rules, plus `validateLattice`
 * - `confusion`     — which concepts learners genuinely mix up, and why
 * - `evidence`      — the shared evidence vocabulary and its strengths
 * - `activities`    — recognition and production, their evidence and corrections
 * - `smartscore`    — per-concept confidence from BKT, recency and evidence variety
 * - `masteryLadder` — ordered → randomized → in_person, and who may close the top
 * - `anomalies`     — patterns worth a teacher's attention, with denominators
 * - `talqin`        — model-pronunciation resolution, always labelled
 * - `lessonPlan`    — one session: intro → practice → review, inside a tier budget
 */

export * from "./concepts";
export * from "./evidence";
export * from "./confusion";
export * from "./activities";
export * from "./smartscore";
export * from "./masteryLadder";
export * from "./anomalies";
export * from "./talqin";
export * from "./lessonPlan";
