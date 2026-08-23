/**
 * Read-side queries.
 *
 * These assemble snapshots for the pure engines. They are deliberately
 * separate from the command layer's repository: reads have different
 * shapes, different caching, and — in time — different storage.
 *
 * Every query here is tenant-scoped by the actor's organization, and the
 * scope comes from the session-derived actor, never from a parameter.
 */
import type { Actor } from "../auth/policy.js";
import { getPool } from "./db.js";
import {
  buildAttentionInbox,
  type AttentionInbox,
  type LearnerSnapshot,
} from "../core/attention.js";
import type { CorrectionCategory, LearnerId } from "../core/types.js";
import {
  buildMemoryMap,
  type MemoryMap,
  type PageTarget,
} from "../core/memory-map.js";

/**
 * Which learners this actor may see.
 *
 * Teachers see the learners in classrooms they are assigned to; academy
 * administrators and directors see their academy. Nobody sees another
 * organization, because the query is scoped by organization first.
 */
async function visibleLearnerIds(actor: Actor): Promise<string[]> {
  const academyIds = actor.roles
    .map((r) => r.academyId)
    .filter((id): id is string => Boolean(id));
  const classroomIds = actor.roles.flatMap((r) => [...(r.classroomIds ?? [])]);
  const isAcademyWide = actor.roles.some(
    (r) => r.role === "academy_admin" || r.role === "academic_director",
  );

  const { rows } = await getPool().query(
    `SELECT DISTINCT e.learner_id
       FROM enrollment e
      WHERE e.organization_id = $1
        AND ( ($2::boolean AND e.academy_id = ANY($3::uuid[]))
              OR e.classroom_id = ANY($4::uuid[]) )`,
    [actor.organizationId, isAcademyWide, academyIds, classroomIds],
  );
  return rows.map((r) => r["learner_id"] as string);
}

export async function loadAttentionInbox(
  actor: Actor,
  now: number,
): Promise<AttentionInbox> {
  const learnerIds = await visibleLearnerIds(actor);
  if (learnerIds.length === 0)
    return buildAttentionInbox([], { now });

  const pool = getPool();
  const [users, requests, corrections, assignments, states, attempts] =
    await Promise.all([
      pool.query(
        `SELECT id, display_name FROM app_user
          WHERE id = ANY($1::uuid[]) AND organization_id = $2`,
        [learnerIds, actor.organizationId],
      ),
      pool.query(
        `SELECT r.id, r.learner_id, r.requested_at, p.label
           FROM oral_recitation_request r
           JOIN assignment a ON a.id = r.assignment_id
           JOIN passage p ON p.id = a.passage_id
          WHERE r.learner_id = ANY($1::uuid[])
            AND r.organization_id = $2
            AND r.status = 'pending'`,
        [learnerIds, actor.organizationId],
      ),
      pool.query(
        `SELECT t.learner_id, c.category, c.added_at, res.resolved_at
           FROM correction c
           JOIN memory_target t ON t.id = c.memory_target_id
           LEFT JOIN correction_resolution res ON res.correction_id = c.id
          WHERE t.learner_id = ANY($1::uuid[]) AND c.organization_id = $2`,
        [learnerIds, actor.organizationId],
      ),
      pool.query(
        `SELECT a.id, a.learner_id, a.created_at, a.due_at, p.label,
                EXISTS (SELECT 1 FROM attempt at WHERE at.assignment_id = a.id)
                  OR EXISTS (SELECT 1 FROM passage_listen pl WHERE pl.assignment_id = a.id)
                  AS started
           FROM assignment a
           JOIN passage p ON p.id = a.passage_id
          WHERE a.learner_id = ANY($1::uuid[]) AND a.organization_id = $2`,
        [learnerIds, actor.organizationId],
      ),
      pool.query(
        `SELECT learner_id,
                count(*) FILTER (WHERE next_review_at <= now())::int AS due,
                count(*) FILTER (WHERE next_review_at <= now() - interval '1 day')::int
                  AS overdue,
                max(updated_at) AS last_active
           FROM memory_state
          WHERE learner_id = ANY($1::uuid[]) AND organization_id = $2
          GROUP BY learner_id`,
        [learnerIds, actor.organizationId],
      ),
      // Delayed recalls: independent attempts recorded after a verification.
      pool.query(
        `SELECT at.learner_id, at.correct, at.occurred_at
           FROM attempt at
           JOIN oral_verification v ON v.assignment_id = at.assignment_id
          WHERE at.learner_id = ANY($1::uuid[])
            AND at.organization_id = $2
            AND at.evidence_class = 'independent_recall'
            AND at.occurred_at > v.decided_at
          ORDER BY at.occurred_at`,
        [learnerIds, actor.organizationId],
      ),
    ]);

  const snapshots: LearnerSnapshot[] = users.rows.map((user) => {
    const id = user["id"] as string;
    const stateRow = states.rows.find((s) => s["learner_id"] === id);
    return {
      learnerId: id as LearnerId,
      displayName: user["display_name"] as string,
      pendingVerifications: requests.rows
        .filter((r) => r["learner_id"] === id)
        .map((r) => ({
          requestId: r["id"] as string,
          label: r["label"] as string,
          requestedAt: (r["requested_at"] as Date).getTime(),
        })),
      corrections: corrections.rows
        .filter((c) => c["learner_id"] === id)
        .map((c) => ({
          category: c["category"] as LearnerSnapshot["corrections"][number]["category"],
          addedAt: (c["added_at"] as Date).getTime(),
          resolvedAt: c["resolved_at"] ? (c["resolved_at"] as Date).getTime() : null,
        })),
      assignments: assignments.rows
        .filter((a) => a["learner_id"] === id)
        .map((a) => ({
          assignmentId: a["id"] as string,
          label: a["label"] as string,
          assignedAt: (a["created_at"] as Date).getTime(),
          dueAt: (a["due_at"] as Date).getTime(),
          started: a["started"] as boolean,
        })),
      dueReviewCount: stateRow ? Number(stateRow["due"]) : 0,
      overdueReviewCount: stateRow ? Number(stateRow["overdue"]) : 0,
      // Null, not zero: a learner with no recorded activity is reported as
      // exactly that.
      lastActiveAt: stateRow?.["last_active"]
        ? (stateRow["last_active"] as Date).getTime()
        : null,
      delayedRecalls: attempts.rows
        .filter((a) => a["learner_id"] === id)
        .map((a) => ({
          correct: a["correct"] as boolean,
          occurredAt: (a["occurred_at"] as Date).getTime(),
        })),
      governanceRequests: [],
    };
  });

  return buildAttentionInbox(snapshots, { now, maxRows: 25 });
}

export interface VerificationContext {
  learnerName: string;
  passageLabel: string;
  policyVersion: string;
  assignedBy: string;
  priorCorrections: readonly {
    category: CorrectionCategory;
    addedAt: string;
    resolved: boolean;
  }[];
  cueHistory: { independent: number; assisted: number };
}

/**
 * Load one verification request.
 *
 * Returns undefined for a request in another tenant, for a learner this
 * actor does not teach, or for one that does not exist — the caller cannot
 * tell the three apart, which is the point.
 */
export async function loadVerificationContext(
  actor: Actor,
  requestId: string,
): Promise<VerificationContext | undefined> {
  const visible = await visibleLearnerIds(actor);
  if (visible.length === 0) return undefined;

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT r.policy_version, r.learner_id, r.assignment_id,
            u.display_name AS learner_name,
            owner.display_name AS assigned_by,
            p.label,
            a.memory_target_id
       FROM oral_recitation_request r
       JOIN assignment a ON a.id = r.assignment_id
       JOIN passage p ON p.id = a.passage_id
       JOIN app_user u ON u.id = r.learner_id
       JOIN app_user owner ON owner.id = a.owner_user_id
      WHERE r.id = $1
        AND r.organization_id = $2
        AND r.learner_id = ANY($3::uuid[])
        AND r.status = 'pending'`,
    [requestId, actor.organizationId, visible],
  );
  const row = rows[0];
  if (!row) return undefined;

  const [corrections, cues] = await Promise.all([
    pool.query(
      `SELECT c.category, c.added_at, res.resolved_at
         FROM correction c
         LEFT JOIN correction_resolution res ON res.correction_id = c.id
        WHERE c.memory_target_id = $1 AND c.organization_id = $2
        ORDER BY c.added_at DESC`,
      [row["memory_target_id"], actor.organizationId],
    ),
    pool.query(
      `SELECT
         count(*) FILTER (WHERE evidence_class = 'independent_recall')::int AS independent,
         count(*) FILTER (WHERE evidence_class <> 'independent_recall')::int AS assisted
       FROM attempt WHERE assignment_id = $1`,
      [row["assignment_id"]],
    ),
  ]);

  return {
    learnerName: row["learner_name"] as string,
    passageLabel: row["label"] as string,
    policyVersion: row["policy_version"] as string,
    assignedBy: row["assigned_by"] as string,
    priorCorrections: corrections.rows.map((c) => ({
      category: c["category"] as CorrectionCategory,
      addedAt: (c["added_at"] as Date).toISOString().slice(0, 10),
      resolved: c["resolved_at"] !== null,
    })),
    cueHistory: {
      independent: Number(cues.rows[0]?.["independent"] ?? 0),
      assisted: Number(cues.rows[0]?.["assisted"] ?? 0),
    },
  };
}

export interface SessionLayout {
  segmentId: string;
  pageNumber: number;
  lines: readonly {
    lineNumber: number;
    tokens: readonly {
      tokenId: string;
      positionInLine: number;
      text: string;
      widthUnits: number;
    }[];
  }[];
  tiles: readonly { tokenId: string; text: string }[];
}

/**
 * Layout for one assignment's passage.
 *
 * Tiles are shuffled by a seed derived from the assignment, so the order
 * is stable within a session but not the printed order — a tray in reading
 * order would make reconstruction a copying exercise.
 */
export async function loadSessionLayout(
  actor: Actor,
  assignmentId: string,
): Promise<SessionLayout | undefined> {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT lt.id AS token_id, lt.page_number, lt.line_number, lt.position_in_line,
            w.text, length(w.text) AS width_units,
            (SELECT s.id FROM segment s
              WHERE s.assignment_id = a.id ORDER BY s.ordinal LIMIT 1) AS segment_id
       FROM assignment a
       JOIN passage p ON p.id = a.passage_id
       JOIN ayah start_ayah ON start_ayah.id = p.start_ayah_id
       JOIN ayah end_ayah ON end_ayah.id = p.end_ayah_id
       JOIN ayah covered
            ON covered.corpus_version_id = p.corpus_version_id
           AND covered.surah_number = start_ayah.surah_number
           AND covered.number_in_surah BETWEEN start_ayah.number_in_surah
                                           AND end_ayah.number_in_surah
       JOIN word w ON w.ayah_id = covered.id
       JOIN layout_token lt ON lt.word_id = w.id
      WHERE a.id = $1 AND a.organization_id = $2
      ORDER BY lt.page_number, lt.line_number, lt.position_in_line`,
    [assignmentId, actor.organizationId],
  );
  const first = rows[0];
  if (!first) return undefined;

  const byLine = new Map<number, SessionLayout["lines"][number]["tokens"][number][]>();
  for (const row of rows) {
    const line = Number(row["line_number"]);
    const token = {
      tokenId: row["token_id"] as string,
      positionInLine: Number(row["position_in_line"]),
      text: row["text"] as string,
      widthUnits: Number(row["width_units"]),
    };
    const list = byLine.get(line);
    if (list) list.push(token);
    else byLine.set(line, [token]);
  }

  const lines = [...byLine.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([lineNumber, tokens]) => ({ lineNumber, tokens }));

  // A deterministic shuffle: stable across a reload, unrelated to reading
  // order, and derived from the assignment rather than a clock.
  const tiles = rows
    .map((row) => ({
      tokenId: row["token_id"] as string,
      text: row["text"] as string,
      sortKey: hash(`${assignmentId}:${row["token_id"] as string}`),
    }))
    .sort((a, b) => a.sortKey - b.sortKey)
    .map(({ tokenId, text }) => ({ tokenId, text }));

  return {
    segmentId: first["segment_id"] as string,
    pageNumber: Number(first["page_number"]),
    lines,
    tiles,
  };
}

/** Small stable string hash. Not cryptographic; it orders tiles. */
function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ChildReport {
  childName: string;
  weekSummary: readonly string[];
  quietDays: readonly string[];
  teacherRequest?: { text: string; teacherName: string; date: string };
  homeTasks: readonly {
    id: string;
    description: string;
    assignedByName: string;
    checkedByName?: string;
    checkedOn?: string;
    done: boolean;
  }[];
  lastVerification?: { date: string; decision: string };
}

const DAY_MS = 86_400_000;

/**
 * The parent report.
 *
 * Returns undefined unless an approved, unrevoked, unexpired guardianship
 * with view permission exists right now. A pending claim returns undefined,
 * exactly as a nonexistent child does.
 */
export async function loadChildReport(
  actor: Actor,
  childId: string,
  now: number,
): Promise<ChildReport | undefined> {
  const pool = getPool();

  const { rows: grants } = await pool.query(
    `SELECT 1 FROM guardian_relationship
      WHERE guardian_user_id = $1 AND child_user_id = $2
        AND organization_id = $3
        AND status = 'approved' AND can_view_child
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())`,
    [actor.userId, childId, actor.organizationId],
  );
  const isStaff = actor.roles.some((r) =>
    ["teacher", "assistant_teacher", "academy_admin", "academic_director"].includes(r.role),
  );
  if (grants.length === 0 && !isStaff) return undefined;
  if (isStaff && grants.length === 0) {
    const visible = await visibleLearnerIds(actor);
    if (!visible.includes(childId)) return undefined;
  }

  const { rows: users } = await pool.query(
    `SELECT display_name FROM app_user WHERE id = $1 AND organization_id = $2`,
    [childId, actor.organizationId],
  );
  const user = users[0];
  if (!user) return undefined;

  const weekStart = new Date(now - 7 * DAY_MS);

  const [recalls, verifications, activity] = await Promise.all([
    pool.query(
      `SELECT p.label, at.occurred_at,
              EXTRACT(EPOCH FROM (at.occurred_at - v.decided_at)) / 86400 AS delay_days
         FROM attempt at
         JOIN assignment a ON a.id = at.assignment_id
         JOIN passage p ON p.id = a.passage_id
         JOIN oral_verification v ON v.assignment_id = a.id
        WHERE at.learner_id = $1 AND at.organization_id = $2
          AND at.evidence_class = 'independent_recall' AND at.correct
          AND at.occurred_at > v.decided_at
          AND at.occurred_at >= $3
        ORDER BY at.occurred_at DESC`,
      [childId, actor.organizationId, weekStart],
    ),
    pool.query(
      `SELECT decision, decided_at FROM oral_verification
        WHERE learner_id = $1 AND organization_id = $2
        ORDER BY decided_at DESC LIMIT 1`,
      [childId, actor.organizationId],
    ),
    pool.query(
      `SELECT DISTINCT date_trunc('day', occurred_at) AS day
         FROM attempt
        WHERE learner_id = $1 AND organization_id = $2 AND occurred_at >= $3`,
      [childId, actor.organizationId, weekStart],
    ),
  ]);

  const weekSummary = recalls.rows.slice(0, 3).map((r) => {
    const days = Math.round(Number(r["delay_days"]));
    return `${user["display_name"]} recalled ${r["label"]} on their own after ${days} ${days === 1 ? "day" : "days"}.`;
  });

  // Days with no recorded practice are named, not left as gaps.
  const activeDays = new Set(
    activity.rows.map((r) => (r["day"] as Date).toISOString().slice(0, 10)),
  );
  const quietDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now - i * DAY_MS).toISOString().slice(0, 10);
    if (!activeDays.has(day)) quietDays.push(day);
  }

  const report: ChildReport = {
    childName: user["display_name"] as string,
    weekSummary,
    quietDays,
    homeTasks: [],
  };
  const verification = verifications.rows[0];
  if (verification)
    report.lastVerification = {
      date: (verification["decided_at"] as Date).toISOString().slice(0, 10),
      decision: String(verification["decision"]).replace(/_/g, " "),
    };
  return report;
}

/**
 * The learner's memory map.
 *
 * Page numbers come from the layout of each target's passage. A target
 * spanning two pages is counted on the page its passage starts on; the
 * map is a summary, and splitting a target across cells would show a
 * learner two half-facts instead of one whole one.
 */
export async function loadMemoryMap(
  actor: Actor,
  learnerId: LearnerId,
  now: number,
): Promise<MemoryMap> {
  const { rows } = await getPool().query(
    `SELECT ms.state, ms.stability_days, ms.difficulty, ms.last_reviewed_at,
            ms.next_review_at, ms.algorithm_version,
            (SELECT min(lt.page_number)
               FROM layout_token lt
               JOIN word w ON w.id = lt.word_id
              WHERE w.ayah_id = p.start_ayah_id) AS page_number,
            (SELECT count(*)::int FROM correction c
              LEFT JOIN correction_resolution cr ON cr.correction_id = c.id
             WHERE c.memory_target_id = ms.memory_target_id
               AND cr.correction_id IS NULL) AS unresolved_corrections,
            (SELECT max(v.decided_at) FROM oral_verification v
              WHERE v.memory_target_id = ms.memory_target_id) AS last_verified_at,
            t.kind
       FROM memory_state ms
       JOIN memory_target t ON t.id = ms.memory_target_id
       JOIN assignment a ON a.id = ms.assignment_id
       JOIN passage p ON p.id = a.passage_id
      WHERE ms.learner_id = $1 AND ms.organization_id = $2`,
    [learnerId, actor.organizationId],
  );

  const targets: PageTarget[] = rows
    .filter((r) => r["page_number"] !== null)
    .map((r) => {
      const target: PageTarget = {
        pageNumber: Number(r["page_number"]),
        state: r["state"] as PageTarget["state"],
        unresolvedCorrections: Number(r["unresolved_corrections"] ?? 0),
        connectionWeaknesses: r["kind"] === "connection_boundary" ? 1 : 0,
      };
      if (r["stability_days"] !== null && r["last_reviewed_at"] !== null)
        target.scheduling = {
          stabilityDays: Number(r["stability_days"]),
          difficulty: Number(r["difficulty"]),
          lastReviewedAt: (r["last_reviewed_at"] as Date).getTime(),
          nextReviewAt: (r["next_review_at"] as Date).getTime(),
          algorithmVersion: String(r["algorithm_version"]),
        };
      if (r["last_verified_at"])
        target.lastVerifiedAt = (r["last_verified_at"] as Date).getTime();
      return target;
    });

  return buildMemoryMap(targets, now);
}
