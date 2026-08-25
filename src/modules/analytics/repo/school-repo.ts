import { withTenant } from "../../platform/db/tenant";
import { buildSchoolOverview, periodOf, type RankedRow, type SchoolOverview } from "../domain/school-overview";
import { parseUnitId } from "../../memory/domain/types";

/**
 * The school's aggregates.
 *
 * Every query here counts. None of them reads a child's recitation, a
 * recording, or a teacher's note: an administrator is answering "is this school
 * working?", and that question never requires opening a child's work.
 */
export async function loadSchoolOverview(
  organizationId: string,
  now: Date = new Date(),
  days = 7,
): Promise<SchoolOverview> {
  const period = periodOf(now, days);

  return withTenant(organizationId, async (tx) => {
    const [learnersOnRoll, enrolments, teachers] = await Promise.all([
      tx.learnerProfile.count({}),
      tx.enrollment.findMany({ where: { leftAt: null }, select: { learnerUserId: true } }),
      tx.roleGrant.findMany({ where: { role: "teacher" }, select: { userId: true } }),
    ]);
    const enrolled = new Set(enrolments.map((row) => row.learnerUserId));

    const activeRows = await tx.learningEvent.findMany({
      where: { occurredAt: { gte: period.from, lte: period.to } },
      select: { learnerUserId: true },
      distinct: ["learnerUserId"],
    });

    const verificationRows = await tx.verificationRequest.findMany({
      where: { requestedAt: { gte: period.from, lte: period.to } },
      select: { requestedAt: true, decidedAt: true, decidedBy: true },
    });

    const teacherIds = new Set(teachers.map((row) => row.userId));
    const verifiedBy = new Set(
      verificationRows.map((row) => row.decidedBy).filter((id): id is string => id !== null),
    );

    // Curriculum coverage: how many learners hold anything in each juzʾ we have
    // evidence for. Least covered first — that is the row an admin acts on.
    const held = await tx.memoryState.findMany({
      where: { verifiedAt: { not: null } },
      select: { unitId: true, learnerUserId: true },
    });
    const bySurah = new Map<number, Set<string>>();
    for (const row of held) {
      const parsed = parseUnitId(row.unitId);
      if (parsed?.kind !== "ayah_body") continue;
      const set = bySurah.get(parsed.ayah.surah) ?? new Set<string>();
      set.add(row.learnerUserId);
      bySurah.set(parsed.ayah.surah, set);
    }
    const coverage: RankedRow[] = [...bySurah.entries()].map(([surah, learners]) => ({
      id: `surah:${surah}`,
      label: String(surah),
      labelKey: "school.coverage.surah",
      value: learners.size,
      denominator: enrolled.size,
    }));

    // Interventions: learners waiting longest for an ear. Named, because a
    // school cannot act on an anonymous aggregate — but nothing of their work
    // is shown here beyond the fact that they are waiting.
    const waitingRows = await tx.verificationRequest.findMany({
      where: { state: "pending" },
      select: { learnerUserId: true, requestedAt: true },
      orderBy: { requestedAt: "asc" },
      take: 50,
    });
    const learnerNames = await tx.user.findMany({
      where: { id: { in: [...new Set(waitingRows.map((r) => r.learnerUserId))] } },
      select: { id: true, displayName: true },
    });
    const nameOf = new Map(learnerNames.map((row) => [row.id, row.displayName]));
    const interventions: RankedRow[] = waitingRows.map((row) => ({
      id: row.learnerUserId,
      label: nameOf.get(row.learnerUserId) ?? row.learnerUserId,
      labelKey: "school.intervention.waitingHours",
      value: Math.floor((now.getTime() - row.requestedAt.getTime()) / 3_600_000),
      denominator: waitingRows.length,
    }));

    const requestRows = await tx.dataRequest.groupBy({ by: ["state"], _count: { _all: true } });
    const countFor = (state: string) =>
      requestRows.find((row) => row.state === state)?._count._all ?? 0;

    return buildSchoolOverview({
      period,
      learnersEnrolled: enrolled.size,
      learnersOnRoll,
      learnersActive: activeRows.filter((row) => enrolled.has(row.learnerUserId)).length,
      teachersWhoVerified: [...verifiedBy].filter((id) => teacherIds.has(id)).length,
      teachers: teacherIds.size,
      verifications: verificationRows.map((row) => ({
        requestedAt: row.requestedAt,
        decidedAt: row.decidedAt,
      })),
      coverage,
      interventions,
      dataRequests: {
        received: countFor("received"),
        running: countFor("running"),
        completed: countFor("completed"),
        failed: countFor("failed"),
      },
      now,
    });
  });
}
