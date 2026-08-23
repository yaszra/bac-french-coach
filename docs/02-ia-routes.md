# 02 — Information architecture and route map

## Principle

**Today is the orchestration layer.** Every role's Today answers "what should I
do now?" within five seconds. Everything else is a room you enter deliberately.

Secondary features do not earn global navigation. Competitions, Voice Lab,
Strength, Khatma, studios, and data-quality queues live behind context or
explicit permissions.

## Navigation by role

| Role | Destinations |
|---|---|
| Learner | Today · Memorize · Review · Reading · Progress |
| Little learner | Today · My Page · Grown-up |
| Teacher | Today · Learners · Assign · Verify · Curriculum · Reports |
| Parent | Today · My Child · Home Tasks · Messages |
| Academy admin | People · Academies & Classes · Content & Approvals · Governance · Analytics · Settings |

Settings, help, reciter, speed, language, account, and accessibility live in the
account menu or as contextual controls — never in global navigation.

## First-release route map

### Public and account
```
/                     marketing home
/how-it-works         the evidence loop, explained honestly
/for-academies        buyer-facing
/trust                content provenance, privacy, what we do NOT claim
/privacy
/terms
/login
/forgot-password
/accept-invite        one-time token, expiring
```

### Learner
```
/learn/today                      one next action
/learn/session/[assignmentId]     the nine-stage loop
/learn/review                     due + fragile, from blank
/learn/memory-map                 604-page memory map
/learn/reading                    Qāʿidah path
```

### Teacher
```
/teach/today                      attention inbox
/teach/learners
/teach/learners/[learnerId]       profile: independent vs assisted, joins, corrections
/teach/assign                     4-step wizard
/teach/verify                     queue
/teach/verify/[requestId]         verification workspace
/teach/reports
```

### Parent
```
/family/today
/family/children/[childId]
/family/tasks
/family/permissions               claims, grants, revocation
```

### Admin
```
/admin/people
/admin/classes
/admin/content
/admin/content/approvals
/admin/governance
/admin/audit
/admin/settings
```

## Required states per route

Every route above ships with designed:

- **loading** — skeleton that preserves layout (no CLS)
- **empty** — says what would fill it and what to do
- **stale** — "last updated N minutes ago" when a read model lags
- **permission-denied** — explains *who* can grant access, leaks nothing
- **offline** — what still works, what is queued
- **recoverable-error** — a retry that does not lose learner input

A route is not "done" until all seven exist.

## Route-level guarantees

| Guarantee | Applies to |
|---|---|
| Server-side authorization before render | every non-public route |
| Tenant scoping before resource lookup | every tenant-owned resource |
| No Qurʾānic text in URL, log line, or notification preview | all |
| Muṣḥaf visually dominant; nothing overlaps it | `/learn/session/*`, `/learn/review` |
| Blank page on entry | `/learn/session/*`, `/learn/review` |
