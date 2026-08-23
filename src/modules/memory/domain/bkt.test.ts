import { describe, expect, it } from "vitest";

import {
  BKT_CONFIDENCE_OBSERVATIONS,
  DEFAULT_BKT_PARAMS,
  bktToMemoryState,
  initialBktState,
  isMastered,
  pKnownFromStability,
  paramsFor,
  posterior,
  predict,
  stabilityFromPKnown,
  update,
  updatePKnown,
  validateBktParams,
  type BktParams,
} from "./bkt";
import { mulberry32 } from "./simulate";

const CONCEPT = "c:letter.baa.fathah";
const START = new Date("2026-03-01T09:00:00.000Z");

describe("predict", () => {
  it("rises with mastery and stays inside the guess/slip envelope", () => {
    const low = predict(0.1);
    const high = predict(0.9);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThanOrEqual(DEFAULT_BKT_PARAMS.pGuess * 0.5);
    expect(high).toBeLessThan(1 - DEFAULT_BKT_PARAMS.pSlip + 0.001);
  });
});

describe("posterior", () => {
  it("rises on a correct answer and falls on an incorrect one (property)", () => {
    const rand = mulberry32(2026);
    for (let trial = 0; trial < 300; trial += 1) {
      const pKnown = 0.001 + rand() * 0.998;
      expect(posterior(pKnown, true)).toBeGreaterThan(pKnown);
      expect(posterior(pKnown, false)).toBeLessThan(pKnown);
    }
  });

  it("stays strictly inside (0,1) for any evidence (property)", () => {
    const rand = mulberry32(11);
    for (let trial = 0; trial < 300; trial += 1) {
      const pKnown = rand();
      const correct = rand() > 0.5;
      const value = posterior(pKnown, correct);
      expect(value).toBeGreaterThan(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("never claims certainty however long the correct streak", () => {
    let pKnown = DEFAULT_BKT_PARAMS.pInit;
    for (let step = 0; step < 200; step += 1) pKnown = updatePKnown(pKnown, true);
    expect(pKnown).toBeLessThan(1);
    expect(pKnown).toBeGreaterThan(0.99);
  });
});

describe("update", () => {
  it("adds the learning opportunity on top of the posterior", () => {
    const pKnown = 0.4;
    expect(updatePKnown(pKnown, false)).toBeGreaterThan(posterior(pKnown, false));
    expect(updatePKnown(pKnown, true)).toBeGreaterThan(posterior(pKnown, true));
  });

  it("tracks observations and their denominators", () => {
    let state = initialBktState(CONCEPT);
    expect(state.pKnown).toBeCloseTo(DEFAULT_BKT_PARAMS.pInit, 10);
    state = update(state, true, DEFAULT_BKT_PARAMS, START, "recognition");
    state = update(state, false, DEFAULT_BKT_PARAMS, START, "recognition");
    expect(state.observations).toBe(2);
    expect(state.correctObservations).toBe(1);
    expect(state.lastSeenAt).toEqual(START);
    expect(state.lastRetrievalType).toBe("recognition");
  });

  it("falls under a run of wrong answers but stays above zero", () => {
    let state = initialBktState(CONCEPT);
    for (let step = 0; step < 5; step += 1) state = update(state, true);
    const learned = state.pKnown;
    for (let step = 0; step < 20; step += 1) state = update(state, false);
    expect(state.pKnown).toBeLessThan(learned);
    expect(state.pKnown).toBeGreaterThan(0);
  });
});

describe("parameters", () => {
  it("merges per-concept overrides over the defaults", () => {
    const overrides = { [CONCEPT]: { pGuess: 0.05 } };
    const merged = paramsFor(CONCEPT, DEFAULT_BKT_PARAMS, overrides);
    expect(merged.pGuess).toBeCloseTo(0.05, 10);
    expect(merged.pTransit).toBeCloseTo(DEFAULT_BKT_PARAMS.pTransit, 10);
    expect(paramsFor("c:letter.taa.kasrah", DEFAULT_BKT_PARAMS, overrides).pGuess).toBeCloseTo(
      DEFAULT_BKT_PARAMS.pGuess,
      10,
    );
  });

  it("lowering the guess rate makes a correct answer more informative", () => {
    const lowGuess: BktParams = { ...DEFAULT_BKT_PARAMS, pGuess: 0.05 };
    expect(posterior(0.3, true, lowGuess)).toBeGreaterThan(posterior(0.3, true, DEFAULT_BKT_PARAMS));
  });

  it("reports parameter problems instead of throwing", () => {
    const codes = validateBktParams({ pInit: 1.4, pTransit: 0.2, pSlip: 0.6, pGuess: 0.6 }).map(
      (error) => error.code,
    );
    expect(codes).toContain("p_init_out_of_range");
    expect(codes).toContain("degenerate_model");
    expect(validateBktParams(DEFAULT_BKT_PARAMS)).toEqual([]);
  });

  it("carries an i18n key on every parameter error", () => {
    for (const error of validateBktParams({ pInit: 2, pTransit: 2, pSlip: 2, pGuess: 2 })) {
      expect(error.reason.key).toMatch(/^memory\.bkt\.error\./);
    }
  });
});

describe("bridge to MemoryState", () => {
  it("maps mastery to stability strictly monotonically (property)", () => {
    const rand = mulberry32(5150);
    for (let trial = 0; trial < 200; trial += 1) {
      const lower = 0.01 + rand() * 0.97;
      const higher = lower + (1 - lower) * (0.01 + rand() * 0.5);
      expect(stabilityFromPKnown(higher)).toBeGreaterThan(stabilityFromPKnown(lower));
    }
  });

  it("round-trips through the inverse map", () => {
    for (const pKnown of [0.05, 0.25, 0.5, 0.75, 0.95, 0.99]) {
      expect(pKnownFromStability(stabilityFromPKnown(pKnown))).toBeCloseTo(pKnown, 6);
    }
  });

  it("presents a concept in the shared MemoryState shape", () => {
    let state = initialBktState(CONCEPT);
    for (let step = 0; step < 8; step += 1) state = update(state, step % 4 !== 3, DEFAULT_BKT_PARAMS, START);
    const memory = bktToMemoryState(state);
    expect(memory.unitId).toBe(CONCEPT);
    expect(memory.kind).toBe("reading_concept");
    expect(memory.reps).toBe(8);
    expect(memory.lapses).toBe(2);
    expect(memory.stability).toBeCloseTo(stabilityFromPKnown(state.pKnown), 10);
    expect(memory.difficulty).toBeGreaterThanOrEqual(1);
    expect(memory.difficulty).toBeLessThanOrEqual(10);
    expect(memory.lastReviewAt).toEqual(START);
  });

  it("grows confidence with observations and caps it by evidence weight", () => {
    let state = initialBktState(CONCEPT);
    const thin = bktToMemoryState(state).confidence;
    for (let step = 0; step < BKT_CONFIDENCE_OBSERVATIONS * 4; step += 1) {
      state = update(state, true, DEFAULT_BKT_PARAMS, START);
    }
    const thick = bktToMemoryState(state).confidence;
    expect(thin).toBe(0);
    expect(thick).toBeGreaterThan(0.9);
    expect(bktToMemoryState(state, { evidenceWeight: 0.3 }).confidence).toBeLessThan(0.35);
  });

  it("gates mastery on a high posterior", () => {
    let state = initialBktState(CONCEPT);
    expect(isMastered(state)).toBe(false);
    for (let step = 0; step < 30; step += 1) state = update(state, true);
    expect(isMastered(state)).toBe(true);
  });
});
