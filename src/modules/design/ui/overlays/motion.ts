/**
 * The motion tokens, mirrored for the few places that must count in
 * JavaScript (a tooltip's delay, a toast's dwell). CSS still styles from
 * var(--motion-*) — these values exist only so timers agree with the sheet.
 */
export const MOTION_FAST_MS = 120;
export const MOTION_BASE_MS = 200;
export const MOTION_SLOW_MS = 320;
