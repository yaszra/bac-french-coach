/**
 * Presence — who is working right now.
 *
 * This is deliberately the smallest useful thing. Presence answers one
 * question a teacher asks while walking between desks: is this learner
 * working at this moment? It is NOT telemetry: there is no dwell time, no
 * keystroke count, no idle-mouse tracking, and no history. A learner who
 * closes their laptop simply stops being present, and nothing is retained.
 *
 * Only three states exist, and the third one is the honest one:
 *   · `working`   — activity inside the working window
 *   · `idle`      — seen recently, nothing since the working window
 *   · `away`      — nothing recorded inside the presence window at all
 *
 * Pure: `now` is an argument, and nothing here reads a clock or a database.
 */

export const PRESENCE_STATES = ["working", "idle", "away"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

/** One heartbeat. A learner id and a moment — nothing else is collected. */
export type PresenceBeat = {
  readonly learnerUserId: string;
  readonly at: Date;
};

export type PresenceConfig = {
  /** Seconds since the last beat within which a learner is working. */
  readonly workingWithinSeconds: number;
  /** Seconds since the last beat within which they are still on the list. */
  readonly presentWithinSeconds: number;
};

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  workingWithinSeconds: 90,
  presentWithinSeconds: 600,
};

export type PresenceEntry = {
  readonly learnerUserId: string;
  readonly state: PresenceState;
  /** Whole seconds since the last beat. Rounded down; never negative. */
  readonly secondsSince: number;
};

export function stateOf(
  lastBeat: Date | null,
  now: Date,
  config: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
): PresenceState {
  if (lastBeat === null) return "away";
  const seconds = (now.getTime() - lastBeat.getTime()) / 1000;
  if (seconds <= config.workingWithinSeconds) return "working";
  if (seconds <= config.presentWithinSeconds) return "idle";
  return "away";
}

/**
 * Fold heartbeats into one entry per learner.
 *
 * A learner on the roster with no beat at all is `away`, not absent from the
 * list: the teacher asked about their class, and a missing row would read as a
 * missing student.
 */
export function summarise(
  roster: readonly string[],
  beats: readonly PresenceBeat[],
  now: Date,
  config: PresenceConfig = DEFAULT_PRESENCE_CONFIG,
): readonly PresenceEntry[] {
  const latest = new Map<string, Date>();
  for (const beat of beats) {
    const current = latest.get(beat.learnerUserId);
    if (current === undefined || beat.at > current) latest.set(beat.learnerUserId, beat.at);
  }

  return roster.map((learnerUserId) => {
    const last = latest.get(learnerUserId) ?? null;
    return {
      learnerUserId,
      state: stateOf(last, now, config),
      secondsSince:
        last === null ? 0 : Math.max(0, Math.floor((now.getTime() - last.getTime()) / 1000)),
    };
  });
}

/** How many of the class are working — with its denominator, as ever. */
export function workingCount(entries: readonly PresenceEntry[]): {
  readonly working: number;
  readonly roster: number;
} {
  return {
    working: entries.filter((entry) => entry.state === "working").length,
    roster: entries.length,
  };
}

/**
 * The wire payload. Small on purpose: an id, a state, and an age in seconds.
 * A stream a teacher leaves open all evening should cost almost nothing.
 */
export type PresenceFrame = {
  readonly at: string;
  readonly entries: readonly (readonly [string, PresenceState, number])[];
};

export function toFrame(entries: readonly PresenceEntry[], now: Date): PresenceFrame {
  return {
    at: now.toISOString(),
    entries: entries.map((entry) => [entry.learnerUserId, entry.state, entry.secondsSince] as const),
  };
}

export function encodeFrame(frame: PresenceFrame): string {
  // Server-sent events are newline-delimited, so the payload must be one line.
  return `data: ${JSON.stringify(frame)}\n\n`;
}
