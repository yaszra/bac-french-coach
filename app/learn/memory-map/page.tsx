/**
 * /learn/memory-map — the Progress surface.
 *
 * The map of what this learner's memory actually looks like across the
 * muṣḥaf, which is the asset the whole product accrues.
 */
import { redirect } from "next/navigation";
import { MemoryMap } from "../../../src/ui/components/MemoryMap.js";
import { LocaleProvider } from "../../../src/ui/i18n/context.js";
import { requireActor } from "../../../src/server/actor.js";
import { loadMemoryMap } from "../../../src/server/queries.js";
import type { LearnerId } from "../../../src/core/types.js";

export const dynamic = "force-dynamic";

export default async function MemoryMapPage() {
  const result = await requireActor();
  if (!result.ok) redirect("/login");

  const map = await loadMemoryMap(
    result.actor,
    result.actor.userId as LearnerId,
    Date.now(),
  );
  return (
    <LocaleProvider locale="en">
      <MemoryMap map={map} />
    </LocaleProvider>
  );
}
