/**
 * Links into the workspace.
 *
 * A unit id contains `:` and `>`, so it always travels URL-encoded. Keeping the
 * builder in one place means a link can never be assembled by hand and quietly
 * lose its join.
 */
export type PracticeLink = {
  readonly unitId?: string | undefined;
  readonly stream?: "new" | "recent" | "old" | undefined;
  readonly mode?: "practice" | "test" | undefined;
};

export function practiceHref(link: PracticeLink = {}): string {
  const query = new URLSearchParams();
  if (link.unitId !== undefined) query.set("unit", link.unitId);
  if (link.stream !== undefined) query.set("stream", link.stream);
  if (link.mode !== undefined && link.mode !== "practice") query.set("mode", link.mode);
  const search = query.toString();
  return search === "" ? "/practice" : `/practice?${search}`;
}
