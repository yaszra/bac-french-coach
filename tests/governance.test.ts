/**
 * Guardian and governance workflows — acceptance criterion 14.
 *
 * "A guardian with a pending claim sees no child data, and tutoring
 * permission can be revoked immediately."
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  approveGuardianClaim,
  claimGuardianship,
  decideDataRequest,
  recordConsent,
  requestDataExport,
  requestDeletion,
  revokeGuardianship,
  withdrawConsent,
} from "../src/application/governance.js";
import { InMemoryGovernanceStore } from "../src/application/memory-governance-store.js";
import { authorize, AuthorizationError, type Actor } from "../src/auth/policy.js";
import { CommandError } from "../src/application/commands.js";
import { useDeterministicIds } from "../src/application/ids.js";
import { ORG_A, ORG_B, LEARNER_A, T0, guardian, teacher } from "./helpers.js";

const DAY = 86_400_000;

const admin: Actor = {
  userId: "admin-a",
  organizationId: ORG_A,
  roles: [{ role: "academy_admin", academyId: "academy-a" }],
  sessionValid: true,
  mfaSatisfied: true,
};

let store: InMemoryGovernanceStore;

beforeEach(() => {
  useDeterministicIds();
  store = new InMemoryGovernanceStore();
});

/** Can this guardian actually see the child right now? */
function canSeeChild(guardianActor: Actor, now: number): boolean {
  return authorize(
    guardianActor,
    "child.report.view",
    { kind: "child_report", organizationId: ORG_A, learnerId: LEARNER_A },
    {
      guardianRelationships: store.guardianRelationships(),
      enrollments: [],
      now,
    },
  ).allowed;
}

describe("a claim grants nothing until an authorized adult approves it", () => {
  it("creates the claim with no capabilities at all", async () => {
    const { status } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    expect(status).toBe("pending");
    const claim = (await store.findClaim("guardian-a", LEARNER_A))!;
    expect(claim.canViewChild).toBe(false);
    expect(claim.canTutorAndApprove).toBe(false);
  });

  it("shows the guardian nothing while the claim is pending", async () => {
    await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    expect(canSeeChild(guardian(), T0)).toBe(false);
  });

  it("refuses a duplicate claim", async () => {
    await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await expect(
      claimGuardianship(store, {
        actor: guardian(),
        now: T0 + 1,
        childUserId: LEARNER_A,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("lets a teacher claim nothing: approval is an administrator's decision", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await expect(
      approveGuardianClaim(store, {
        actor: teacher(),
        now: T0 + 1,
        claimId,
        canViewChild: true,
        canTutorAndApprove: false,
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("grants access once approved", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await approveGuardianClaim(store, {
      actor: admin,
      now: T0 + 1,
      claimId,
      canViewChild: true,
      canTutorAndApprove: false,
    });
    expect(canSeeChild(guardian(), T0 + 2)).toBe(true);
  });
});

describe("viewing and tutoring are granted separately", () => {
  it("refuses tutoring permission without viewing permission", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await expect(
      approveGuardianClaim(store, {
        actor: admin,
        now: T0 + 1,
        claimId,
        canViewChild: false,
        canTutorAndApprove: true,
      }),
    ).rejects.toThrow(/requires permission to view/);
  });

  it("can grant viewing alone", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    const claim = await approveGuardianClaim(store, {
      actor: admin,
      now: T0 + 1,
      claimId,
      canViewChild: true,
      canTutorAndApprove: false,
    });
    expect(claim.canViewChild).toBe(true);
    expect(claim.canTutorAndApprove).toBe(false);
  });
});

describe("revocation takes effect immediately", () => {
  async function approvedClaim(): Promise<string> {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await approveGuardianClaim(store, {
      actor: admin,
      now: T0 + 1,
      claimId,
      canViewChild: true,
      canTutorAndApprove: true,
    });
    return claimId;
  }

  it("stops access at the very next decision, with no session to expire", async () => {
    const claimId = await approvedClaim();
    expect(canSeeChild(guardian(), T0 + 2)).toBe(true);

    await revokeGuardianship(store, {
      actor: admin,
      now: T0 + 3,
      claimId,
      reason: "parent requested",
    });
    expect(canSeeChild(guardian(), T0 + 4)).toBe(false);
  });

  it("clears both capabilities, not only the one that prompted it", async () => {
    const claimId = await approvedClaim();
    const revoked = await revokeGuardianship(store, {
      actor: admin,
      now: T0 + 3,
      claimId,
      reason: "safeguarding review",
    });
    expect(revoked.canViewChild).toBe(false);
    expect(revoked.canTutorAndApprove).toBe(false);
    expect(revoked.revokedAt).toBe(T0 + 3);
  });

  it("lets a teacher revoke as well as an administrator", async () => {
    const claimId = await approvedClaim();
    await expect(
      revokeGuardianship(store, {
        actor: teacher(),
        now: T0 + 3,
        claimId,
        reason: "teacher concern",
      }),
    ).resolves.toBeTruthy();
  });

  it("expires a time-limited grant without any cleanup job", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await approveGuardianClaim(store, {
      actor: admin,
      now: T0 + 1,
      claimId,
      canViewChild: true,
      canTutorAndApprove: false,
      expiresAt: T0 + DAY,
    });
    expect(canSeeChild(guardian(), T0 + DAY - 1)).toBe(true);
    expect(canSeeChild(guardian(), T0 + DAY + 1)).toBe(false);
  });
});

describe("cross-tenant governance", () => {
  it("hides a claim belonging to another organization", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await expect(
      approveGuardianClaim(store, {
        actor: { ...admin, organizationId: ORG_B },
        now: T0 + 1,
        claimId,
        canViewChild: true,
        canTutorAndApprove: false,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("consent states a specific purpose", () => {
  it("refuses a vague purpose", async () => {
    await expect(
      recordConsent(store, {
        actor: admin,
        now: T0,
        subjectUserId: LEARNER_A,
        purpose: "stuff",
      }),
    ).rejects.toThrow(/specific stated purpose/);
  });

  it("records and withdraws consent", async () => {
    const consent = await recordConsent(store, {
      actor: admin,
      now: T0,
      subjectUserId: LEARNER_A,
      purpose: "asynchronous recitation recordings for verification",
    });
    await withdrawConsent(store, {
      actor: admin,
      now: T0 + DAY,
      consentId: consent.consentId,
      subjectUserId: LEARNER_A,
    });
    const [stored] = await store.listConsents(LEARNER_A);
    expect(stored?.withdrawnAt).toBe(T0 + DAY);
  });

  it("refuses to withdraw twice", async () => {
    const consent = await recordConsent(store, {
      actor: admin,
      now: T0,
      subjectUserId: LEARNER_A,
      purpose: "asynchronous recitation recordings for verification",
    });
    await withdrawConsent(store, {
      actor: admin,
      now: T0 + DAY,
      consentId: consent.consentId,
      subjectUserId: LEARNER_A,
    });
    await expect(
      withdrawConsent(store, {
        actor: admin,
        now: T0 + 2 * DAY,
        consentId: consent.consentId,
        subjectUserId: LEARNER_A,
      }),
    ).rejects.toThrow(/already withdrawn/);
  });
});

describe("export and deletion are workflows, not database edits", () => {
  it("refuses an export to a guardian with no approved relationship", async () => {
    await expect(
      requestDataExport(store, {
        actor: guardian(),
        now: T0,
        subjectUserId: LEARNER_A,
        guardianships: [],
      }),
    ).rejects.toThrow(AuthorizationError);
  });

  it("allows an export to an approved guardian and audits it", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await approveGuardianClaim(store, {
      actor: admin,
      now: T0 + 1,
      claimId,
      canViewChild: true,
      canTutorAndApprove: false,
    });
    const request = await requestDataExport(store, {
      actor: guardian(),
      now: T0 + 2,
      subjectUserId: LEARNER_A,
      guardianships: store.guardianRelationships(),
    });
    expect(request.status).toBe("requested");
    const trail = await store.listAudit(ORG_A);
    expect(trail.some((e) => e.action === "data.export.requested")).toBe(true);
  });

  it("keeps deletion a two-step decision an administrator makes", async () => {
    const request = await requestDeletion(store, {
      actor: admin,
      now: T0,
      subjectUserId: LEARNER_A,
      guardianships: [],
    });
    expect(request.status).toBe("requested");

    await expect(
      decideDataRequest(store, {
        actor: teacher(),
        now: T0 + 1,
        requestId: request.requestId,
        outcome: "approved",
        reason: "ok",
      }),
    ).rejects.toThrow(/administrator/);

    const decided = await decideDataRequest(store, {
      actor: admin,
      now: T0 + 2,
      requestId: request.requestId,
      outcome: "approved",
      reason: "verified with the academy",
    });
    expect(decided.status).toBe("approved");
  });

  it("requires a refusal to state its reason", async () => {
    const request = await requestDeletion(store, {
      actor: admin,
      now: T0,
      subjectUserId: LEARNER_A,
      guardianships: [],
    });
    await expect(
      decideDataRequest(store, {
        actor: admin,
        now: T0 + 1,
        requestId: request.requestId,
        outcome: "refused",
        reason: "   ",
      }),
    ).rejects.toThrow(/must state its reason/);
  });

  it("refuses to decide the same request twice", async () => {
    const request = await requestDeletion(store, {
      actor: admin,
      now: T0,
      subjectUserId: LEARNER_A,
      guardianships: [],
    });
    await decideDataRequest(store, {
      actor: admin,
      now: T0 + 1,
      requestId: request.requestId,
      outcome: "approved",
      reason: "verified",
    });
    await expect(
      decideDataRequest(store, {
        actor: admin,
        now: T0 + 2,
        requestId: request.requestId,
        outcome: "refused",
        reason: "changed my mind",
      }),
    ).rejects.toThrow(CommandError);
  });
});

describe("every governance decision leaves an audit entry", () => {
  it("records who did what, when, and why — including denials", async () => {
    const { claimId } = await claimGuardianship(store, {
      actor: guardian(),
      now: T0,
      childUserId: LEARNER_A,
    });
    await approveGuardianClaim(store, {
      actor: admin,
      now: T0 + 1,
      claimId,
      canViewChild: true,
      canTutorAndApprove: true,
    });
    await revokeGuardianship(store, {
      actor: admin,
      now: T0 + 2,
      claimId,
      reason: "parent requested",
    });
    // A denial is audited too: attempts matter as much as successes.
    await expect(
      approveGuardianClaim(store, {
        actor: teacher(),
        now: T0 + 3,
        claimId,
        canViewChild: true,
        canTutorAndApprove: false,
      }),
    ).rejects.toThrow();

    const trail = await store.listAudit(ORG_A);
    expect(trail.map((e) => e.action)).toEqual([
      "guardian.claim.created",
      "guardian.claim.approved",
      "guardian.grant.revoked",
      "guardian.claim.approve",
    ]);
    expect(trail.at(-1)?.outcome).toBe("denied");
    for (const entry of trail) {
      expect(entry.actorUserId).toBeTruthy();
      expect(entry.occurredAt).toBeGreaterThanOrEqual(T0);
    }
  });
});
