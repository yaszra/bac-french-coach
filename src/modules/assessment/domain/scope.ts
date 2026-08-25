/**
 * Which units a verdict is allowed to decide.
 *
 * A verdict used to accept whatever unit ids the client sent. The request it
 * answered was loaded to check the learner and the state — its `unitScope`,
 * the record of what was actually asked about, was not even selected. So a
 * verifier could mark any unit at all verified for that learner, and the
 * history would say a person had listened to a passage nobody recited. That is
 * the evidence rule breaking at the one place it exists to hold.
 *
 * This is the allowed set, derived from the request. A verdict may name fewer
 * units than were asked about — hearing three āyahs of five and saying so is
 * honest — but never a unit outside it.
 */

export type UnitScope =
  | { readonly sura: number; readonly ayahFrom: number; readonly ayahTo: number }
  | { readonly unitId: string };

const MAX_AYAHS_IN_SCOPE = 300;

function bodyId(sura: number, ayah: number): string {
  return `b:${sura}:${ayah}`;
}

function transitionId(sura: number, from: number, to: number): string {
  return `t:${sura}:${from}>${sura}:${to}`;
}

/**
 * The units a request covers, or null when its scope records nothing usable.
 *
 * Transitions between consecutive āyahs of the passage are included: the seam
 * between two āyahs is where ḥifẓ actually fails, and a teacher who hears the
 * join fail is entitled to record it against the join.
 */
export function unitsInScope(scope: unknown): ReadonlySet<string> | null {
  if (scope === null || typeof scope !== "object" || Array.isArray(scope)) return null;
  const record = scope as Record<string, unknown>;

  if (typeof record.unitId === "string" && record.unitId.length > 0) {
    return new Set([record.unitId]);
  }

  const { sura, ayahFrom } = record;
  if (typeof sura !== "number" || typeof ayahFrom !== "number") return null;
  const ayahTo = typeof record.ayahTo === "number" ? record.ayahTo : ayahFrom;
  if (ayahTo < ayahFrom) return null;
  // A scope is a passage a person recited, not a whole muṣḥaf. An absurd range
  // is a malformed request, and building millions of ids from it would be the
  // wrong answer to it.
  if (ayahTo - ayahFrom + 1 > MAX_AYAHS_IN_SCOPE) return null;

  const units = new Set<string>();
  for (let ayah = ayahFrom; ayah <= ayahTo; ayah += 1) {
    units.add(bodyId(sura, ayah));
    if (ayah < ayahTo) units.add(transitionId(sura, ayah, ayah + 1));
  }
  return units;
}

/** The submitted ids, when every one of them is inside the scope. Otherwise null. */
export function unitsWithinScope(
  submitted: readonly string[],
  scope: unknown,
): readonly string[] | null {
  const allowed = unitsInScope(scope);
  if (allowed === null) return null;
  if (submitted.length === 0) return null;
  return submitted.every((unitId) => allowed.has(unitId)) ? submitted : null;
}
