/**
 * Marginalia internal class joiner.
 *
 * Lives in `display/` because `controls/` builds on `display/` (Button uses
 * Spinner); the dependency arrow never points the other way.
 */
export type ClassValue = string | false | null | undefined;

export function cx(...parts: readonly ClassValue[]): string {
  return parts.filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
}
