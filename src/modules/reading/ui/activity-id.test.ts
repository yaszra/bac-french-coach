import { describe, expect, it } from "vitest";

import {
  MAX_ACTIVITY_ID_LENGTH,
  decodeActivityId,
  encodeActivityId,
  isSessionId,
  type ActivityIdParts,
} from "./activity-id";

const PARTS: ActivityIdParts = {
  form: "recognition",
  conceptId: "letter.beh",
  presentation: "ordered",
  sessionId: "s1abc",
  index: 3,
};

describe("an activity id is the activity, written down", () => {
  it("round-trips every part", () => {
    const id = encodeActivityId(PARTS);
    expect(id).not.toBeNull();
    expect(decodeActivityId(id as string)).toEqual(PARTS);
  });

  it("round-trips a production item at the top rung", () => {
    const parts: ActivityIdParts = { ...PARTS, form: "production", presentation: "in_person" };
    const id = encodeActivityId(parts);
    expect(decodeActivityId(id as string)).toEqual(parts);
  });

  it("round-trips a composite concept id", () => {
    const parts: ActivityIdParts = { ...PARTS, conceptId: "letter.alef.fathah", presentation: "randomized" };
    expect(decodeActivityId(encodeActivityId(parts) as string)).toEqual(parts);
  });

  it("is deterministic — the same parts always produce the same id", () => {
    expect(encodeActivityId(PARTS)).toBe(encodeActivityId(PARTS));
  });

  it("stays inside the length the schema admits", () => {
    const id = encodeActivityId({ ...PARTS, conceptId: "letter.alef.fathah", sessionId: "s".repeat(40) });
    expect((id as string).length).toBeLessThanOrEqual(MAX_ACTIVITY_ID_LENGTH);
  });
});

describe("an id that cannot be read back is never written", () => {
  it("refuses an Arabic concept id", () => {
    expect(encodeActivityId({ ...PARTS, conceptId: "letter.ب" })).toBeNull();
  });

  it("refuses a session id carrying the separator", () => {
    expect(encodeActivityId({ ...PARTS, sessionId: "a~b" })).toBeNull();
    expect(isSessionId("a~b")).toBe(false);
  });

  it("refuses an out-of-range or fractional index", () => {
    expect(encodeActivityId({ ...PARTS, index: -1 })).toBeNull();
    expect(encodeActivityId({ ...PARTS, index: 1000 })).toBeNull();
    expect(encodeActivityId({ ...PARTS, index: 1.5 })).toBeNull();
  });

  it("refuses a session id long enough to overflow the id", () => {
    expect(encodeActivityId({ ...PARTS, sessionId: "s".repeat(41) })).toBeNull();
  });
});

describe("decoding refuses anything this module did not write", () => {
  it("refuses the wrong number of parts", () => {
    expect(decodeActivityId("r~letter.beh~o~s1")).toBeNull();
    expect(decodeActivityId("r~letter.beh~o~s1~3~extra")).toBeNull();
  });

  it("refuses an unknown form or presentation token", () => {
    expect(decodeActivityId("x~letter.beh~o~s1~3")).toBeNull();
    expect(decodeActivityId("r~letter.beh~q~s1~3")).toBeNull();
  });

  it("refuses a concept id that is not a concept id", () => {
    expect(decodeActivityId("r~Letter.Beh~o~s1~3")).toBeNull();
    expect(decodeActivityId("r~~o~s1~3")).toBeNull();
  });

  it("refuses a non-numeric index", () => {
    expect(decodeActivityId("r~letter.beh~o~s1~x")).toBeNull();
  });

  it("refuses an id longer than the maximum", () => {
    expect(decodeActivityId(`r~letter.beh~o~${"s".repeat(200)}~1`)).toBeNull();
  });

  it("refuses an empty string", () => {
    expect(decodeActivityId("")).toBeNull();
  });
});
