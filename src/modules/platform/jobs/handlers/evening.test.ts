import { describe, expect, it } from "vitest";
import { EVENING_HOUR, isKnownTimezone, isLocalEvening, localDate, localHour } from "./evening";

/**
 * "Tonight" is a local word. These tests exist because a single global hour is
 * the easy mistake, and it makes the report wrong about the day it covers.
 */
const at = (iso: string) => new Date(iso);

describe("each family's own evening", () => {
  it("reads the wall-clock hour in the family's timezone", () => {
    expect(localHour("Europe/Paris", at("2026-08-23T17:30:00Z"))).toBe(19);
    expect(localHour("Asia/Kuala_Lumpur", at("2026-08-23T17:30:00Z"))).toBe(1);
    expect(localHour("UTC", at("2026-08-23T17:30:00Z"))).toBe(17);
  });

  it("fires for Paris and not for Kuala Lumpur at the same instant", () => {
    const instant = at("2026-08-23T17:30:00Z");
    expect(isLocalEvening("Europe/Paris", instant)).toBe(true);
    expect(isLocalEvening("Asia/Kuala_Lumpur", instant)).toBe(false);
  });

  it("fires for Kuala Lumpur at its own evening, eleven hours earlier in UTC", () => {
    const instant = at("2026-08-23T11:05:00Z");
    expect(isLocalEvening("Asia/Kuala_Lumpur", instant)).toBe(true);
    expect(isLocalEvening("Europe/Paris", instant)).toBe(false);
  });

  it("dates the report by the family's own calendar, not by UTC", () => {
    // 23:30 in Kuala Lumpur on the 23rd is still the 23rd there, and already
    // the 23rd in UTC — but at 08:30 UTC on the 24th it is the 24th in KL.
    expect(localDate("Asia/Kuala_Lumpur", at("2026-08-23T15:30:00Z"))).toBe("2026-08-23");
    expect(localDate("Pacific/Auckland", at("2026-08-23T15:30:00Z"))).toBe("2026-08-24");
    expect(localDate("America/Los_Angeles", at("2026-08-23T02:30:00Z"))).toBe("2026-08-22");
  });

  it("follows daylight saving rather than a fixed offset", () => {
    // Paris is UTC+2 in August and UTC+1 in January.
    expect(isLocalEvening("Europe/Paris", at("2026-08-23T17:00:00Z"))).toBe(true);
    expect(isLocalEvening("Europe/Paris", at("2026-01-23T17:00:00Z"))).toBe(false);
    expect(isLocalEvening("Europe/Paris", at("2026-01-23T18:00:00Z"))).toBe(true);
  });

  it("recognises an unusable timezone instead of quietly becoming UTC", () => {
    expect(isKnownTimezone("Europe/Paris")).toBe(true);
    expect(isKnownTimezone("Mars/Olympus_Mons")).toBe(false);
  });

  it("keeps the evening hour a single named constant", () => {
    expect(EVENING_HOUR).toBe(19);
    expect(isLocalEvening("UTC", at("2026-08-23T19:59:00Z"), EVENING_HOUR)).toBe(true);
    expect(isLocalEvening("UTC", at("2026-08-23T20:00:00Z"), EVENING_HOUR)).toBe(false);
  });
});
