import { describe, expect, it } from "vitest";
import { decideClaim, normalizeLearnerCode, PENDING_CLAIM_VISIBILITY, approverLabelKey } from "./claim";
import {
  planChannel,
  planDispatch,
  whatsappWindowOpen,
  deliveryStateOf,
  IN_APP_ONLY,
  type ChannelContext,
} from "./channels";
import { deliveryNoteKey } from "../../classroom/ui/notification-delivery";
import {
  FAMILY_EVENT_TYPES,
  HOME_TASKS,
  assertFamilyEventType,
  homeTaskCompletion,
  isLearningEventType,
  suggestHomeTask,
} from "./home-task";
import {
  consentStateOf,
  isPastRetention,
  isVoiceRecordingAllowed,
  purgeDateFor,
  summarize,
  type ConsentRecordLike,
} from "./consent";
import { buildTonight, recallLine } from "./tonight";
import { buildDailyReport, type ReportEvent } from "../../analytics/domain/daily-report";
import { EVENT_TYPES } from "../../platform/events/types";

const NOW = new Date("2026-08-23T20:00:00Z");

describe("claiming a child", () => {
  it("stays a claim when the learner already has a teacher to ask", () => {
    const outcome = decideClaim({ hasApprovedTeacher: true });
    expect(outcome.state).toBe("claimed");
    expect(outcome.approvedBy).toBeNull();
    expect(outcome.messageKey).toBe("family.claim.waitingForTeacher");
  });

  it("approves immediately when there is nobody to ask, and says so distinctly", () => {
    const outcome = decideClaim({ hasApprovedTeacher: false });
    expect(outcome.state).toBe("approved");
    expect(outcome.approvedBy).toBe("no_teacher_to_ask");
    expect(outcome.messageKey).not.toBe(decideClaim({ hasApprovedTeacher: true }).messageKey);
  });

  it("never lists a child's progress among what a pending claim can see", () => {
    expect(PENDING_CLAIM_VISIBILITY.visible).not.toContain("family.claim.hidden.progress");
    expect(PENDING_CLAIM_VISIBILITY.hidden).toContain("family.claim.hidden.recordings");
    const overlap = PENDING_CLAIM_VISIBILITY.visible.filter((key) =>
      (PENDING_CLAIM_VISIBILITY.hidden as readonly string[]).includes(key),
    );
    expect(overlap).toEqual([]);
  });

  it("forgives spacing and case in a code, and refuses anything else", () => {
    expect(normalizeLearnerCode(" nur-2026 ")).toEqual({ ok: true, code: "NUR2026" });
    expect(normalizeLearnerCode("kid")).toEqual({ ok: true, code: "KID" });
    expect(normalizeLearnerCode("ab")).toMatchObject({ ok: false, reasonKey: "family.link.error.tooShort" });
    expect(normalizeLearnerCode("code!!")).toMatchObject({
      ok: false,
      reasonKey: "family.link.error.badCharacters",
    });
  });

  it("labels a tutoring guardian as a guardian, never as a teacher", () => {
    expect(approverLabelKey("guardian_tutor")).toBe("family.approver.guardianTutor");
    expect(approverLabelKey("guardian_tutor")).not.toBe(approverLabelKey("teacher"));
  });
});

const base: ChannelContext = {
  consents: { comms_email: true, comms_whatsapp: true },
  hasEmailAddress: true,
  hasPushSubscription: true,
  hasWhatsappNumber: true,
  lastInboundAt: new Date("2026-08-23T10:00:00Z"),
  templateApproval: "approved",
};

describe("channels and their honest fallbacks", () => {
  it("always delivers in-app, whatever else is unavailable", () => {
    const ctx: ChannelContext = {
      ...base,
      consents: {},
      hasEmailAddress: false,
      hasPushSubscription: false,
      hasWhatsappNumber: false,
    };
    const dispatch = planDispatch(["email", "whatsapp", "push"], ctx, NOW);
    expect(dispatch.delivering).toHaveLength(1);
    expect(dispatch.delivering[0]).toMatchObject({ channel: "in_app", kind: "send" });
  });

  it("sends free-form WhatsApp inside the 24-hour window", () => {
    expect(whatsappWindowOpen(new Date("2026-08-23T10:00:00Z"), NOW)).toBe(true);
    expect(planChannel("whatsapp", base, NOW)).toEqual({
      kind: "send",
      channel: "whatsapp",
      mode: "free_form",
    });
  });

  it("uses an approved template once the window has closed", () => {
    const ctx = { ...base, lastInboundAt: new Date("2026-08-20T10:00:00Z") };
    expect(whatsappWindowOpen(ctx.lastInboundAt, NOW)).toBe(false);
    expect(planChannel("whatsapp", ctx, NOW)).toEqual({
      kind: "send",
      channel: "whatsapp",
      mode: "template",
    });
  });

  it("offers the manual fallback when the window is closed and the template is not approved", () => {
    for (const [approval, reasonKey] of [
      ["pending", "family.channel.fallback.templatePending"],
      ["rejected", "family.channel.fallback.templateRejected"],
      ["none", "family.channel.fallback.windowClosed"],
    ] as const) {
      const plan = planChannel(
        "whatsapp",
        { ...base, lastInboundAt: null, templateApproval: approval },
        NOW,
      );
      expect(plan).toEqual({
        kind: "manual_fallback",
        channel: "whatsapp",
        reasonKey,
        copyForGuardian: true,
      });
    }
  });

  it("refuses rather than queues when consent or an address is missing", () => {
    expect(planChannel("email", { ...base, consents: {} }, NOW)).toMatchObject({
      kind: "refused",
      reasonKey: "family.channel.refused.noEmailConsent",
    });
    expect(planChannel("email", { ...base, hasEmailAddress: false }, NOW)).toMatchObject({
      kind: "refused",
      reasonKey: "family.channel.refused.noEmailAddress",
    });
    expect(planChannel("whatsapp", { ...base, hasWhatsappNumber: false }, NOW)).toMatchObject({
      kind: "refused",
      reasonKey: "family.channel.refused.noWhatsappNumber",
    });
    expect(planChannel("push", { ...base, hasPushSubscription: false }, NOW)).toMatchObject({
      kind: "refused",
      reasonKey: "family.channel.refused.noPushDevice",
    });
  });

  it("never produces a queued or pending delivery state", () => {
    const states = planDispatch(["email", "whatsapp", "push"], { ...base, lastInboundAt: null, templateApproval: "none" }, NOW)
      .plans.map(deliveryStateOf);
    expect(states).not.toContain("pending");
    expect(new Set(states)).toEqual(new Set(["sent", "manual_fallback"]));
  });

  it("gives every state the planner can produce a note the inbox can render", () => {
    /* The two vocabularies drifted apart once already: the planner wrote
       "sent" while the inbox only knew "pending" and "failed", so a delivered
       notification said "waiting to send" for ever. This test is the join. */
    const produced = new Set<string>([
      deliveryStateOf(planChannel("in_app", IN_APP_ONLY, NOW)),
      ...planDispatch(["email", "whatsapp", "push"], base, NOW).plans.map(deliveryStateOf),
      ...planDispatch(
        ["email", "whatsapp", "push"],
        { ...base, consents: {}, hasEmailAddress: false, hasWhatsappNumber: false, hasPushSubscription: false },
        NOW,
      ).plans.map(deliveryStateOf),
    ]);
    expect(produced.has("sent")).toBe(true);
    for (const state of produced) {
      // "sent" is the one state that says nothing extra: the row is the delivery.
      if (state === "sent") expect(deliveryNoteKey(state)).toBeNull();
      else expect(deliveryNoteKey(state)).not.toBeNull();
    }
  });

  it("resolves an in-app notification to sent, so no row waits for a send that will never come", () => {
    expect(deliveryStateOf(planChannel("in_app", IN_APP_ONLY, NOW))).toBe("sent");
  });

  it("treats a future inbound timestamp as no open window rather than an open one", () => {
    expect(whatsappWindowOpen(new Date("2026-08-24T10:00:00Z"), NOW)).toBe(false);
  });

  it("does not duplicate a channel a caller lists twice", () => {
    const dispatch = planDispatch(["email", "email", "in_app"], base, NOW);
    expect(dispatch.plans.map((p) => p.channel)).toEqual(["in_app", "email"]);
  });
});

describe("home tasks are not evidence", () => {
  it("keeps the family vocabulary disjoint from the learning event stream", () => {
    for (const type of FAMILY_EVENT_TYPES) {
      expect(isLearningEventType(type)).toBe(false);
      expect(EVENT_TYPES as readonly string[]).not.toContain(type);
    }
  });

  it("refuses to record family activity under a learning event type", () => {
    expect(() => assertFamilyEventType("attempt.recorded")).toThrow(/never be written as learning evidence/);
    expect(() => assertFamilyEventType("verdict.given")).toThrow();
  });

  it("marks a completion as not evidence in the row itself", () => {
    const entry = homeTaskCompletion({
      learnerUserId: "u_kid",
      taskId: "listen_together",
      byUserId: "u_parent",
      occurredAt: NOW,
    });
    expect(entry.isEvidence).toBe(false);
    expect(entry.type).toBe("family.home_task.completed");
  });

  it("refuses an unknown task rather than inventing one", () => {
    expect(() =>
      homeTaskCompletion({ learnerUserId: "u", taskId: "nope", byUserId: "p", occurredAt: NOW }),
    ).toThrow(/unknown home task/);
  });

  it("suggests exactly one task, chosen from what was actually observed", () => {
    expect(suggestHomeTask({ struggleReasonKeys: ["struggle.weakJoin"], quietDay: false }).id).toBe(
      "practise_the_join",
    );
    expect(suggestHomeTask({ struggleReasonKeys: [], quietDay: true }).id).toBe("listen_together");
    expect(HOME_TASKS.every((task) => task.minutes > 0)).toBe(true);
  });
});

const granted: ConsentRecordLike = {
  purpose: "voice_recording",
  granted: true,
  grantedAt: new Date("2026-06-01T00:00:00Z"),
  revokedAt: null,
  retentionDays: 90,
};

describe("consent and retention", () => {
  it("treats a missing record as never given, not as switched off", () => {
    expect(consentStateOf(null)).toBe("never_given");
    expect(isVoiceRecordingAllowed(null)).toBe(false);
  });

  it("allows recording only while consent stands", () => {
    expect(isVoiceRecordingAllowed(granted)).toBe(true);
    expect(isVoiceRecordingAllowed({ ...granted, revokedAt: NOW })).toBe(false);
    expect(isVoiceRecordingAllowed({ ...granted, granted: false })).toBe(false);
  });

  it("gives a real purge date, ninety days from the recording", () => {
    const purge = purgeDateFor(granted, new Date("2026-08-01T00:00:00Z"));
    expect(purge).toEqual({ kind: "purge_on", at: new Date("2026-10-30T00:00:00Z") });
  });

  it("brings the purge forward to the moment consent was withdrawn", () => {
    const withdrawn = { ...granted, revokedAt: new Date("2026-08-10T00:00:00Z") };
    expect(purgeDateFor(withdrawn, new Date("2026-08-01T00:00:00Z"))).toEqual({
      kind: "purge_on",
      at: new Date("2026-08-10T00:00:00Z"),
    });
  });

  it("has nothing to purge when consent was never given", () => {
    expect(purgeDateFor(null, NOW)).toEqual({ kind: "nothing_recorded" });
    expect(summarize("voice_recording", null, NOW).nextPurgeAt).toBeNull();
  });

  it("knows what is past its retention", () => {
    expect(isPastRetention(new Date("2026-08-22T00:00:00Z"), NOW)).toBe(true);
    expect(isPastRetention(new Date("2026-09-22T00:00:00Z"), NOW)).toBe(false);
    expect(isPastRetention(null, NOW)).toBe(false);
  });

  it("defaults the retention to ninety days when nothing was ever recorded", () => {
    expect(summarize("voice_recording", null, NOW).retentionDays).toBe(90);
  });
});

function attempt(unitId: string, grade: string, retrievalType = "recall_first"): ReportEvent {
  return {
    type: "attempt.recorded",
    unitId,
    occurredAt: NOW,
    payload: { grade, retrievalType, durationMs: 120_000 },
  };
}

describe("tonight", () => {
  it("says a quiet day plainly instead of showing zeroes as progress", () => {
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events: [],
        reviewsDue: 4,
        wordsHeld: 120,
        wordsHeldLastWeek: null,
      }),
    });
    expect(tonight.state).toBe("quiet");
    expect(tonight.headlineKey).toBe("family.tonight.quietDay");
    expect(tonight.actions).toEqual([]);
  });

  it("invents no comparison when there is no previous week", () => {
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events: [attempt("a:2:3", "good")],
        reviewsDue: 1,
        wordsHeld: 120,
        wordsHeldLastWeek: null,
      }),
    });
    expect(tonight.trend).toEqual({ kind: "no_comparison", wordsHeld: 120 });
  });

  it("expresses the trend in words held, with a direction only when measured", () => {
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events: [attempt("a:2:3", "good")],
        reviewsDue: 1,
        wordsHeld: 154,
        wordsHeldLastWeek: 120,
      }),
    });
    expect(tonight.trend).toEqual({
      kind: "comparison",
      wordsHeld: 154,
      wordsHeldLastWeek: 120,
      deltaWords: 34,
      direction: "more",
    });
  });

  it("gives exactly one action per struggle and no more", () => {
    const events = [
      attempt("t:2:3", "again"),
      attempt("t:2:3", "again"),
      attempt("a:5:9", "again"),
      attempt("a:5:9", "again"),
    ];
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events,
        reviewsDue: 2,
        wordsHeld: 100,
        wordsHeldLastWeek: 100,
      }),
    });
    expect(tonight.actions).toHaveLength(2);
    for (const action of tonight.actions) {
      expect(typeof action.actionKey).toBe("string");
      expect(action.actionKey.length).toBeGreaterThan(0);
    }
  });

  it("refuses a percentage below the minimum and says what is still needed", () => {
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events: [attempt("a:2:3", "good"), attempt("a:2:4", "good")],
        reviewsDue: 2,
        wordsHeld: 10,
        wordsHeldLastWeek: null,
      }),
    });
    const line = recallLine(tonight.unassistedRecall);
    expect(line.kind).toBe("not_yet_recorded");
    if (line.kind === "not_yet_recorded") {
      expect(line.denominator).toBe(2);
      expect(line.needed).toBe(3);
    }
  });

  it("carries a denominator with every percentage it does show", () => {
    const events = Array.from({ length: 6 }, (_, i) => attempt(`a:2:${i}`, i < 5 ? "good" : "again"));
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events,
        reviewsDue: 6,
        wordsHeld: 10,
        wordsHeldLastWeek: null,
      }),
    });
    const line = recallLine(tonight.unassistedRecall);
    expect(line).toMatchObject({ kind: "measured", numerator: 5, denominator: 6, percent: 83 });
  });

  it("names who approved a recitation without turning a guardian into a teacher", () => {
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events: [attempt("a:2:3", "good")],
        reviewsDue: 0,
        wordsHeld: 1,
        wordsHeldLastWeek: null,
      }),
      approvals: [{ unitCount: 3, approvedByName: "Fāṭimah", approverRole: "guardian_tutor" }],
    });
    expect(tonight.approvals[0]?.approverRole).toBe("guardian_tutor");
  });

  it("always offers exactly one home task, never a menu", () => {
    const tonight = buildTonight({
      childName: "Yūsuf",
      report: buildDailyReport({
        learnerUserId: "u_kid",
        forDate: "2026-08-23",
        events: [],
        reviewsDue: 0,
        wordsHeld: 0,
        wordsHeldLastWeek: null,
      }),
    });
    expect(tonight.homeTask.id).toBeTruthy();
  });
});
