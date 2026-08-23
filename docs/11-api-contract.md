# 11 — API and command contract (Phase 1 vertical slice)

Implemented in `src/app/commands.ts`.

## Strategy

- **Typed server-side commands and queries** inside the modular monolith.
- **Versioned REST** for integrations, mobile sync, and institutional clients.
- **Webhooks** for external status changes: signed, idempotent, retried,
  replay-protected.
- **Async events** for reports, notifications, analytics, media, recalculation.
- **No GraphQL** until several real clients need cross-domain query composition
  that REST and read models cannot serve cleanly.
- **No API gateway** until multiple independently operated services exist.

Every command runs: `authorize → validate → load → decide (pure engine) →
persist + emit event (one transaction) → project`.

## Commands

### `createAssignment`
```
in:  { actor, organizationId, learnerId, passageRef, policy, dueAt }
out: { assignmentId, policyVersion }
```
Requires teacher/admin role **and** the teacher–learner relationship.
Creates `assignment` + first `assignment_policy_version`.

### `openAssignment`
```
in:  { actor, assignmentId }
out: { stage, state, requiredListens, listensCompleted }
```
Learner-self only. Emits `assignment_opened`. **Always returns a blank page
state** — no session ever resumes a filled page.

### `recordListen`
```
in:  { actor, assignmentId, segmentId, completed: true }
out: { listensCompleted, listenPolicyMet }
```
Server-counted. A client cannot assert a total, only report one completion, and
the server increments. Emits `passage_listen_completed`.

### `submitRetrieval`
```
in:  { actor, assignmentId, segmentId, scaffoldLevel, startContext,
       correct, assistance[], hesitant, confidence?, idempotencyKey }
out: { evidenceClass, state, reason, progress, engineVersion }
```
The heart of the slice. The client reports **what happened**; the server
classifies it. `evidenceClass` is computed, never accepted from the client.
Emits `retrieval_submitted` (+ `assistance_used`, +
`independent_recall_succeeded|failed`).

### `requestOralRecitation`
```
in:  { actor, assignmentId }
out: { requestId, state }
```
Rejected unless the evidence threshold is met **server-side**. A learner cannot
request their way past the policy.

### `recordOralVerification`
```
in:  { actor, requestId, decision, corrections[] }
out: { state, reason, nextReview }
```
**Authorized verifier only.** Rejected if the actor is the learner, if the actor
lacks the teacher-learner relationship, or if the assignment is teacher-owned
and the actor is a tutoring guardian. Pins assignment, passage, policy version,
verifier, evidence set. Emits `oral_verification_recorded` + `correction_added`.

### `recordReviewOutcome`
```
in:  { actor, targetId, correct, hesitant, occurredAt }
out: { state, stability, difficulty, nextReviewAt, reason }
```
Runs the scheduler. Emits `review_completed` + `review_scheduled`.

### `getToday`
```
in:  { actor, learnerId, now, sessionBudgetMinutes }
out: { continueNow?, newMemory?, keepStrong[], teacherResponse?, deferred[] }
```
Runs the recommendation ranking. Every item carries a human-readable reason.
`deferred[]` is explicit — capped queues state what was deferred and never mark
it complete.

## Error shape

```json
{ "error": { "code": "…", "message": "…", "retryable": false } }
```

| Code | When |
|---|---|
| `unauthenticated` | No valid session |
| `not_found` | Missing **or** cross-tenant (indistinguishable by design) |
| `forbidden` | In-tenant but relationship/grant/role fails |
| `policy_not_met` | Evidence threshold unsatisfied |
| `illegal_transition` | State machine rejected the event |
| `content_not_released` | Source lacks approval, licence, or territory |
| `engine_unavailable` | Scheduler down — a valid, displayed state |
| `conflict` | Idempotency key replay with different payload |

Error messages never contain Qurʾānic text or another learner's data.

## Degradation contract

If analytics, notifications, AI, word-sync, or recommendations fail, the
following must keep working: listening, reconstruction, evidence capture, and
teacher verification. A failed notification or AI call can **never** roll back
learning evidence.
