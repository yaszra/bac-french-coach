import { NextResponse } from "next/server";
import { prisma } from "@/modules/platform/db/client";
import { contentState } from "@/modules/content/domain/loader";

export const dynamic = "force-dynamic";

/**
 * Health, in the sense a deploy gate actually needs: not "the process is up"
 * but "this instance can do its job".
 *
 * A deploy that answers 200 while the content package is missing would ship a
 * muṣḥaf with no text on it, so the content check is part of health rather than
 * a separate alarm nobody wired up.
 */
type Check = { readonly name: string; readonly ok: boolean; readonly detail?: string };

export async function GET(): Promise<NextResponse> {
  const started = Date.now();
  const checks: Check[] = [];

  // The database, through the runtime role and therefore through RLS.
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ name: "database", ok: true });
  } catch (error) {
    checks.push({ name: "database", ok: false, detail: String((error as Error).message).slice(0, 200) });
  }

  // Migrations: an instance running against a schema older than its code is a
  // worse failure than one that will not start, because it half-works.
  try {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM _prisma_migrations WHERE finished_at IS NULL
    `;
    const pending = Number(rows[0]?.count ?? 0);
    checks.push({
      name: "migrations",
      ok: pending === 0,
      ...(pending > 0 ? { detail: `${pending} migration(s) not finished` } : {}),
    });
  } catch (error) {
    checks.push({ name: "migrations", ok: false, detail: String((error as Error).message).slice(0, 200) });
  }

  const content = contentState();
  checks.push({
    name: "content",
    ok: content.kind === "loaded",
    ...(content.kind === "not_yet_recorded" ? { detail: `missing: ${content.missing.join(", ")}` } : {}),
  });

  const ok = checks.every((check) => check.ok);
  return NextResponse.json(
    { ok, checks, tookMs: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
