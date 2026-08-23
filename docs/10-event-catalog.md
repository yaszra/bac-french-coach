# 10 — Learning event catalog

Implemented in `src/app/events.ts`.

## Three separate streams — never conflated

| Stream | Question it answers | Source of truth for |
|---|---|---|
| Operational telemetry | Is the software healthy? | Uptime, latency, errors |
| Product telemetry | Can users complete workflows? | Funnels, drop-off |
| **Learning evidence** | Did independent recall improve after delay? | Memory state, scheduling, reports |

Generic product analytics is **never** the source of truth for learning state.
Learning evidence is written transactionally with the state it justifies.

## Envelope

```ts
{
  eventId, eventType, schemaVersion,
  occurredAt, receivedAt,              // clock skew is visible, not hidden
  actorUserId?, learnerId?,
  organizationId, academyId?, classroomId?, assignmentId?, sessionId?,
  objectRefs,                          // IDs only — never copied sacred text
  activeDurationMs?,                   // active, not wall-clock
  deviceContext?,                      // coarse and minimized
  purpose, retentionClass,
  idempotencyKey
}
```

**`objectRefs` carries identifiers only.** No Qurʾānic text enters the event
stream, the logs, or the warehouse — ever.

## Catalog

| Event | Purpose | Privacy class | Primary consumers | Retention |
|---|---|---|---|---|
| `assignment_opened` | Started-vs-assigned; orientation | Pseudonymous | Teacher inbox, scheduler | 24 months |
| `passage_listen_completed` | Server-side listen count vs policy | Pseudonymous | Policy gate, teacher | 24 months |
| `scaffold_changed` | Cue-withdrawal analysis, frustration detection | Pseudonymous | Research, product | 24 months |
| `retrieval_submitted` | The atomic evidence record | **Learning evidence** | Engine, teacher, reports | 7 years / academy policy |
| `assistance_used` | Marks the attempt assisted | **Learning evidence** | Engine (classification) | 7 years |
| `independent_recall_succeeded` | Threshold progress, stability | **Learning evidence** | Engine, scheduler | 7 years |
| `independent_recall_failed` | Lapse, repair triggering | **Learning evidence** | Engine, scheduler | 7 years |
| `recitation_requested` | Verification queue | Pseudonymous | Teacher inbox | 24 months |
| `oral_verification_recorded` | Human authority record | **Learning evidence** | Engine, audit, reports | 7 years |
| `correction_added` | Misconception ontology | **Learning evidence + sensitive** | Teacher, repair engine | 7 years |
| `correction_resolved` | Repair closure | **Learning evidence** | Teacher, engine | 7 years |
| `review_scheduled` | Scheduling audit / backtest | Pseudonymous | Scheduler, research | 24 months |
| `review_completed` | Delayed-recall outcome | **Learning evidence** | Engine, north-star metric | 7 years |
| `recommendation_served` | Ranking quality | Pseudonymous | Product, research | 12 months |
| `recommendation_accepted` | Ranking quality | Pseudonymous | Product, research | 12 months |
| `session_became_idle` | Separates active from wall-clock time | Pseudonymous | Honest time reporting | 12 months |

## Deliberate omissions

**No `answer_correct` / `answer_incorrect` events.** `retrieval_submitted`
already carries the outcome; duplicating it creates two sources of truth that
will eventually disagree. Events are added only when a named consumer needs one.

**No free-text learner content in the stream.** Correction notes are stored in
the transactional record under access control, not broadcast to analytics.

## Delivery guarantees

- **Transactional outbox** — the event and the state it justifies commit together
  or not at all.
- **Idempotency keys** — a replayed client submission cannot double-count
  evidence.
- **At-least-once delivery** with idempotent consumers; ordering is per
  `(learnerId, targetId)`, not global.
- Dead-letter queue with operator visibility and safe replay.

**SLO: zero silent loss of acknowledged learning evidence.** If we acknowledged
it, it is durable, or we page someone.

## Catalog governance

Every event has a named owner, a stated purpose, a field list, a privacy class,
its consumers, and a retention class. **An event with no named consumer is
deleted from the catalog.** Adding a field requires stating its operational,
learning, safety, or legal purpose.
