/**
 * "Tonight" means tonight where the family lives.
 *
 * The nightly family report runs hourly and asks, per learner, whether it is
 * now that family's evening. A single global hour would send a Kuala Lumpur
 * family their child's evening report over breakfast — which is not a
 * scheduling detail, it is the report being wrong about the day it covers.
 *
 * Pure functions over Intl: no database, no clock of their own.
 */

export const EVENING_HOUR = 19;

/** The local wall-clock hour in a timezone, 0–23. */
export function localHour(timezone: string, at: Date): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  return Number(formatter.format(at));
}

/** The local calendar date in a timezone, as YYYY-MM-DD. */
export function localDate(timezone: string, at: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(at);
}

/** True in the one hourly run that falls in this family's evening. */
export function isLocalEvening(timezone: string, at: Date, eveningHour = EVENING_HOUR): boolean {
  return localHour(timezone, at) === eveningHour;
}

/**
 * A timezone the platform does not recognise must not silently become UTC and
 * send a report at the wrong time; the caller skips it and it is visible.
 */
export function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
