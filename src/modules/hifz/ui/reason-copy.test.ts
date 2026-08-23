import { describe, expect, it } from "vitest";
import { reason } from "@/modules/memory/domain/types";
import { EN, AR } from "../../../../messages";
import { translate } from "@/modules/platform/i18n/translate";
import {
  FALLBACK_REASON_KEY,
  actionMessageKey,
  exerciseInstructionKey,
  exerciseMessageKey,
  reasonCopy,
  reasonMessageKey,
  reasonParams,
} from "./reason-copy";
import { RECOMMENDED_ACTIONS } from "@/modules/memory/domain/policy";
import { EXERCISE_LADDER } from "../domain/exercises";

const ENGINE_KEYS = [
  "memory.reason.verification_overdue",
  "memory.reason.recent_lapse",
  "memory.reason.due_review",
  "memory.reason.weak_join",
  "memory.reason.new_material",
  "memory.reason.new_material_withheld_load",
  "memory.reason.new_material_withheld_tier",
  "memory.reason.maintenance_never_read",
  "memory.reason.maintenance_due",
  "hifz.weak_join.not_yet_recorded",
  "hifz.weak_join.retrievability_gap",
  "hifz.weak_join.stability_gap",
  "hifz.plan.nothing_due",
  "hifz.plan.budget_too_small",
  "hifz.plan.budget_spent",
  "hifz.plan.new_capped",
] as const;

describe("engine reasons become learner copy", () => {
  it("has copy for every reason the engines can emit", () => {
    for (const key of ENGINE_KEYS) {
      expect(reasonMessageKey(key), key).not.toBe(FALLBACK_REASON_KEY);
    }
  });

  it("falls back rather than leaking an engine identifier onto the screen", () => {
    expect(reasonMessageKey("memory.reason.something_new")).toBe(FALLBACK_REASON_KEY);
  });

  it("resolves every mapped key in both languages", () => {
    for (const key of ENGINE_KEYS) {
      const messageKey = reasonMessageKey(key);
      expect(translate("en", messageKey), messageKey).not.toBe(messageKey);
      expect(translate("ar", messageKey), messageKey).not.toBe(messageKey);
    }
  });

  it("resolves the fallback in both languages", () => {
    expect(translate("en", FALLBACK_REASON_KEY)).not.toBe(FALLBACK_REASON_KEY);
    expect(translate("ar", FALLBACK_REASON_KEY)).not.toBe(FALLBACK_REASON_KEY);
  });

  it("shows an āyah reference, never a unit id", () => {
    const params = reasonParams(reason("memory.reason.due_review", { unitId: "t:78:1>78:2" }));
    expect(params.unitId).toBe("78:1 → 78:2");
  });

  it("leaves a malformed unit id alone rather than inventing a reference", () => {
    expect(reasonParams(reason("memory.reason.due_review", { unitId: "nope" })).unitId).toBe("nope");
  });

  it("turns a retrievability into a percentage a person can read", () => {
    const params = reasonParams(reason("memory.reason.due_review", { retrievability: 0.624 }));
    expect(params.retrievability).toBe(62);
  });

  it("leaves other numbers as they are", () => {
    expect(reasonParams(reason("memory.reason.due_review", { overdueDays: 3 })).overdueDays).toBe(3);
  });

  it("marks the fallback so a caller can tell", () => {
    expect(reasonCopy(reason("memory.reason.unheard_of")).isFallback).toBe(true);
    expect(reasonCopy(reason("memory.reason.due_review")).isFallback).toBe(false);
  });
});

describe("action and exercise copy", () => {
  it("has a label for every recommended action, in both languages", () => {
    for (const action of RECOMMENDED_ACTIONS) {
      const key = actionMessageKey(action);
      expect(translate("en", key), key).not.toBe(key);
      expect(translate("ar", key), key).not.toBe(key);
    }
  });

  it("has a title and an instruction for every rung of the ladder", () => {
    for (const exercise of EXERCISE_LADDER) {
      for (const key of [exerciseMessageKey(exercise), exerciseInstructionKey(exercise)]) {
        expect(translate("en", key), key).not.toBe(key);
        expect(translate("ar", key), key).not.toBe(key);
      }
    }
  });

  it("keeps the learner namespace to itself, so no other surface can clobber it", () => {
    expect(Object.keys(EN)).toContain("learner");
    expect(Object.keys(AR)).toContain("learner");
  });
});
