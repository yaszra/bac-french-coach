# 08 — Authorization matrix and tenant isolation

Implemented in `src/auth/policy.ts`. **Frontend hiding is never authorization.**

## Decision order

Every decision runs in this order and stops at the first denial:

```
1. Is the actor authenticated and the session valid?
2. Does the resource's organization match the actor's active organization?   ← tenant gate
3. Does the actor hold a role that can perform this action at all?
4. Does the actor have the required *relationship* to this specific resource?
5. Is any required grant currently active (not pending, not revoked, not expired)?
6. Does resource state permit the action (e.g. threshold met before verification)?
```

Step 2 precedes resource inspection. A cross-tenant identifier must fail as
`not_found`-shaped at the boundary and must never confirm the resource exists.

## Roles

Platform operator · Organization administrator · Academy administrator ·
Academic director · Teacher · Assistant teacher · Parent/guardian ·
Tutoring guardian · Learner

## Matrix (Phase 1 scope)

Legend: ✅ allowed · ➕ allowed with relationship condition · ❌ denied

| Action | Plat op | Org admin | Acad admin | Director | Teacher | Asst teacher | Guardian | Tutoring guardian | Learner |
|---|---|---|---|---|---|---|---|---|---|
| View learner practice surface | ❌ | ❌ | ➕ | ➕ | ➕ | ➕ | ➕ | ➕ | ➕ self |
| Submit retrieval attempt | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➕ self |
| Request oral recitation | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ➕ self |
| **Record oral verification** | ❌ | ❌ | ➕ | ➕ | ➕ | ➕ | ❌ | ➕ own-created only | ❌ |
| Create assignment | ❌ | ❌ | ✅ | ✅ | ➕ | ➕ | ❌ | ➕ own learner | ❌ |
| Edit assignment policy | ❌ | ❌ | ✅ | ✅ | ➕ owner | ❌ | ❌ | ➕ own | ❌ |
| View learner profile | ❌ | ➕ | ➕ | ➕ | ➕ | ➕ | ➕ approved child | ➕ | ❌ |
| View child report | ❌ | ❌ | ➕ | ➕ | ➕ | ➕ | ➕ approved child | ➕ | ❌ |
| Approve guardian claim | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Revoke tutoring grant | ❌ | ✅ | ✅ | ✅ | ➕ | ❌ | ➕ own child | ❌ | ❌ |
| Release content | ❌ | ✅ | ➕ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Read audit log | ✅ | ✅ | ➕ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Export / delete learner data | ❌ | ✅ | ➕ | ❌ | ❌ | ❌ | ➕ own child | ❌ | ❌ |

## Relationship conditions (the part roles alone cannot express)

**Guardian.** A `guardian_relationship` grants access only in `approved` state.
A **pending claim grants nothing** — not a name, not a class, not an existence
check. The parent surface renders the same empty state whether the child exists
or not.

**Tutoring guardian.** May approve work **only if they created it** and **only
while the grant is active**. Two separate capabilities are modelled and stored
separately:
- `can_view_child` — see reports
- `can_tutor_and_approve` — approve parent-created work

Viewing never implies tutoring. Revocation by any authorized adult or academy
administrator takes effect **immediately** — checked at decision time against
current state, never cached into a session or token.

**Teacher.** May verify only learners and assignments permitted by academy
policy: the learner must be enrolled in a classroom the teacher is assigned to
within the same academy.

**Learner.** May act only on themselves, and **may never self-approve
teacher-assigned work** — through UI, API, replay, or direct parameter
mutation. The check is on the assignment's owner, not on the request payload.

## Tenant isolation defence in depth

| Layer | Control |
|---|---|
| Application | Centralized `authorize()`; tenant compared before resource load |
| Query | Every tenant-owned query takes `organization_id` as a required argument |
| Database | PostgreSQL RLS policies keyed to `current_setting('athar.org_id')` |
| API | Tenant derived from the session, **never** from a request parameter |
| Tests | Permission-matrix + cross-tenant probe tests per resource type |
| Monitoring | Any cross-tenant denial is a paged alert, not a log line |

**SLO: zero accepted cross-tenant data access.** Any single occurrence is a
Sev-1 incident.

## Session and account security

- Secure, `HttpOnly`, `SameSite` session cookies with rotation on privilege change
- MFA required for staff and administrators
- Invitation tokens are one-time and expiring
- Account recovery cannot escalate privilege; recovery forces session revocation
- Rate limiting and abuse controls on auth, verification, and export endpoints
- Audit entries for identity, permissions, content release, verification,
  export, and deletion — written in the same transaction as the effect
