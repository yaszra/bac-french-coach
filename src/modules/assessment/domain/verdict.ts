import { correctionDefinition, isMemoryError, type CorrectionMark } from "./taxonomy";

/**
 * Turning a teacher's verdict into consequences.
 *
 * This is the ear-gate: the only path by which a unit becomes verified, and the
 * only place a human's judgement enters the memory graph. It is pure — it
 * decides what *should* happen; the actions layer writes it down.
 */
export type VerdictKind = "passed" | "needs_work" | "not_attempted";

export type VerdictInput = {
  readonly kind: VerdictKind;
  readonly unitIds: readonly string[];
  readonly corrections: readonly CorrectionMark[];
  readonly decidedByUserId: string;
  readonly decidedAt: Date;
};

export type UnitConsequence = {
  readonly unitId: string;
  /** The grade the scheduler should apply, derived from the human's judgement. */
  readonly grade: "again" | "hard" | "good" | "easy";
  readonly verified: boolean;
  readonly lapsed: boolean;
  /** Machine-readable reasons, for the learner's report and the teacher's inbox. */
  readonly reasons: readonly string[];
};

export type VerdictConsequences = {
  readonly units: readonly UnitConsequence[];
  /** Edges to strengthen in the skill graph, e.g. a confusion between two āyahs. */
  readonly graphSignals: readonly {
    readonly relation: "mutashabih_of" | "misconception_of" | "rule_ayah";
    readonly from: string;
    readonly to: string;
  }[];
  /** Drills worth spawning tomorrow, each with the reason it exists. */
  readonly drills: readonly { readonly unitId: string; readonly exercise: string; readonly reasonKey: string }[];
};

function unitIdForAyah(sura: number, ayah: number): string {
  return `b:${sura}:${ayah}`;
}
function unitIdForTransition(from: { sura: number; ayah: number }, to: { sura: number; ayah: number }): string {
  return `t:${from.sura}:${from.ayah}>${to.sura}:${to.ayah}`;
}

/**
 * A verdict is not a score. "Passed with three hesitations" is a real thing a
 * teacher means, and it should shorten an interval without lapsing the unit.
 */
export function applyVerdict(input: VerdictInput): VerdictConsequences {
  const marksByUnit = new Map<string, CorrectionMark[]>();
  for (const mark of input.corrections) {
    const unitId = unitIdForAyah(mark.sura, mark.ayah);
    const list = marksByUnit.get(unitId) ?? [];
    list.push(mark);
    marksByUnit.set(unitId, list);
  }

  const units: UnitConsequence[] = input.unitIds.map((unitId) => {
    const marks = marksByUnit.get(unitId) ?? [];
    const memoryMarks = marks.filter((m) => isMemoryError(m.category));
    const reasons = marks.map((m) => correctionDefinition(m.category).labelKey);

    if (input.kind === "not_attempted") {
      return { unitId, grade: "again", verified: false, lapsed: false, reasons: ["verdict.notAttempted"] };
    }

    if (input.kind === "needs_work") {
      const severe = memoryMarks.some((m) => correctionDefinition(m.category).memoryWeight >= 1);
      return {
        unitId,
        grade: "again",
        verified: false,
        lapsed: severe || memoryMarks.length > 0,
        reasons: reasons.length > 0 ? reasons : ["verdict.needsWork"],
      };
    }

    // Passed. The number of memory slips decides how much credit it earns.
    const weight = memoryMarks.reduce((sum, m) => sum + correctionDefinition(m.category).memoryWeight, 0);
    const grade = weight === 0 ? "easy" : weight <= 0.6 ? "good" : "hard";
    return {
      unitId,
      grade,
      verified: true,
      lapsed: false,
      reasons: reasons.length > 0 ? reasons : ["verdict.passedClean"],
    };
  });

  const graphSignals: VerdictConsequences["graphSignals"] = input.corrections.flatMap((mark) => {
    const definition = correctionDefinition(mark.category);
    if (!definition.graphRelation) return [];
    if (mark.category === "wrong_join" && mark.wentTo) {
      // The learner jumped to a look-alike. That is exactly a mutashābih edge,
      // observed rather than guessed.
      return [
        {
          relation: "mutashabih_of" as const,
          from: unitIdForAyah(mark.sura, mark.ayah),
          to: unitIdForAyah(mark.wentTo.sura, mark.wentTo.ayah),
        },
      ];
    }
    return [
      {
        relation: definition.graphRelation,
        from: unitIdForAyah(mark.sura, mark.ayah),
        to: `rule:${mark.category}`,
      },
    ];
  });

  const drills: VerdictConsequences["drills"] = input.corrections.flatMap((mark) => {
    switch (mark.category) {
      case "wrong_join":
        return [
          {
            unitId: mark.wentTo
              ? unitIdForTransition({ sura: mark.sura, ayah: mark.ayah }, mark.wentTo)
              : unitIdForAyah(mark.sura, mark.ayah),
            exercise: "next_ayah_cue",
            reasonKey: "drill.wrongJoin",
          },
        ];
      case "prompted":
      case "skipped_ayah":
        return [
          { unitId: unitIdForAyah(mark.sura, mark.ayah), exercise: "connect_chain", reasonKey: "drill.needsPrompt" },
        ];
      case "skipped_word":
      case "wrong_word":
        return [{ unitId: unitIdForAyah(mark.sura, mark.ayah), exercise: "gap_fill", reasonKey: "drill.wordLevel" }];
      case "makhraj":
      case "sifah":
      case "madd_length":
      case "ghunnah_idgham":
        // Articulation is practised by listening and imitating, not by rebuilding.
        return [{ unitId: unitIdForAyah(mark.sura, mark.ayah), exercise: "listen", reasonKey: "drill.articulation" }];
      default:
        return [];
    }
  });

  return { units, graphSignals, drills };
}
