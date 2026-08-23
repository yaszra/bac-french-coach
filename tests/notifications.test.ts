/**
 * Notification privacy.
 *
 * "Never put Qurʾānic text, detailed error content, or sensitive learner
 * data in push, SMS, email, or messaging previews."
 */
import { describe, expect, it } from "vitest";
import {
  UnsafePreviewError,
  assertPreviewSafe,
  buildNotification,
  isExternalChannel,
  resolveInApp,
  type NotificationChannel,
  type NotificationKind,
} from "../src/application/notifications.js";
import { containsArabicScript } from "../src/content/tripwire.js";

const KINDS: NotificationKind[] = [
  "recitation_verified",
  "correction_added",
  "review_due",
  "assignment_created",
  "guardian_claim_decided",
  "teacher_has_recitations_waiting",
];

const CHANNELS: NotificationChannel[] = ["push", "email", "sms", "in_app"];

const draft = (kind: NotificationKind, channel: NotificationChannel) => ({
  kind,
  channel,
  recipientUserId: "user-1",
  organizationId: "org-a",
  occurredAt: 0,
  payloadRef: "ref-1",
});

describe("every preview is safe on a lock screen", () => {
  it.each(KINDS)("%s carries no content", (kind) => {
    for (const channel of CHANNELS) {
      const notification = buildNotification(draft(kind, channel));
      expect(containsArabicScript(notification.previewText)).toBe(false);
      expect(notification.previewText).not.toMatch(/\d+\s*(of|\/)\s*\d+/);
      expect(notification.previewText.length).toBeGreaterThan(0);
    }
  });

  it("never names a passage in a preview", () => {
    for (const kind of KINDS)
      expect(buildNotification(draft(kind, "push")).previewText).not.toMatch(
        /Al-Mulk|Baqarah|ayah|surah/i,
      );
  });

  it("never names the learner or the teacher", () => {
    for (const kind of KINDS) {
      const preview = buildNotification(draft(kind, "email")).previewText;
      expect(preview).not.toMatch(/Amina|Kareem|Ustadh/);
    }
  });
});

describe("the safety check is a real check, not decoration", () => {
  it("rejects Arabic script", () => {
    expect(() => assertPreviewSafe("Your teacher wrote ب")).toThrow(
      UnsafePreviewError,
    );
  });

  it("rejects an uninterpolated placeholder, which means data was meant to go there", () => {
    expect(() => assertPreviewSafe("Your teacher reviewed {passage}.")).toThrow(
      /uninterpolated placeholder/,
    );
  });

  it("rejects a correction category, which says what a child got wrong", () => {
    expect(() => assertPreviewSafe("A madd correction was added.")).toThrow(
      /names the correction/,
    );
    expect(() => assertPreviewSafe("There was a word substitution.")).toThrow(
      /names the correction/,
    );
  });

  it("rejects a score or a ratio", () => {
    expect(() => assertPreviewSafe("You recalled 4 of 9 passages.")).toThrow(
      /score or a ratio/,
    );
    expect(() => assertPreviewSafe("Progress: 3/5")).toThrow(/score or a ratio/);
  });

  it("accepts the previews the product actually ships", () => {
    for (const kind of KINDS)
      expect(() =>
        assertPreviewSafe(buildNotification(draft(kind, "push")).previewText),
      ).not.toThrow();
  });
});

describe("channels", () => {
  it("treats push, email, and SMS as externally visible", () => {
    expect(isExternalChannel("push")).toBe(true);
    expect(isExternalChannel("email")).toBe(true);
    expect(isExternalChannel("sms")).toBe(true);
  });

  it("treats in-app as the one authenticated surface", () => {
    expect(isExternalChannel("in_app")).toBe(false);
  });
});

describe("the substance is resolved in-app, after authentication", () => {
  it("may name the passage reference once the reader is known", () => {
    const resolved = resolveInApp("recitation_verified", {
      passageLabel: "Al-Mulk 12-15",
      teacherName: "Ustadh Kareem",
      decision: "verified with a minor slip",
    });
    expect(resolved.body).toContain("Al-Mulk 12-15");
    expect(resolved.body).toContain("Ustadh Kareem");
  });

  it("still never contains Qur'anic text — a label is a reference, not the text", () => {
    for (const kind of KINDS) {
      const resolved = resolveInApp(kind, { passageLabel: "Al-Mulk 12-15" });
      expect(containsArabicScript(resolved.body)).toBe(false);
      expect(containsArabicScript(resolved.title)).toBe(false);
    }
  });

  it("does not spell out the correction even in-app; it points at the session", () => {
    const resolved = resolveInApp("correction_added", {
      passageLabel: "Al-Mulk 12-15",
    });
    expect(resolved.body).toMatch(/Open/);
    expect(resolved.body).not.toMatch(/madd|makhraj|join/);
  });

  it("degrades without context rather than rendering an empty sentence", () => {
    for (const kind of KINDS) {
      const resolved = resolveInApp(kind, {});
      expect(resolved.title.length).toBeGreaterThan(0);
      expect(resolved.body.length).toBeGreaterThan(0);
      expect(resolved.body).not.toMatch(/undefined|null|\{\}/);
    }
  });
});
