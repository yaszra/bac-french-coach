/**
 * Identifier generation.
 *
 * Production uses random UUIDs — the safe default, so nothing has to
 * remember to switch away from a predictable sequence. Tests opt into a
 * deterministic generator, which keeps failures reproducible without
 * making production identifiers guessable.
 */
import { randomUUID } from "node:crypto";

export type IdGenerator = () => string;

const randomGenerator: IdGenerator = () => randomUUID();

let generator: IdGenerator = randomGenerator;
let sequence = 0;

/**
 * Counter-based UUIDs: valid v4-shaped identifiers that are stable across
 * runs, so a failing test names the same rows every time.
 */
export function useDeterministicIds(): void {
  sequence = 0;
  generator = () => {
    sequence += 1;
    return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  };
}

export function useRandomIds(): void {
  generator = randomGenerator;
}

export function nextId(): string {
  return generator();
}
