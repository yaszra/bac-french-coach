/**
 * In-memory governance store for tests and local development.
 *
 * The audit log is append-only here as it is in PostgreSQL: an audit trail
 * that can be edited is not an audit trail.
 */
import type {
  AuditEntry,
  ClaimRecord,
  ConsentRecord,
  DataRequestRecord,
  GovernanceStore,
} from "./governance.js";

export class InMemoryGovernanceStore implements GovernanceStore {
  private claims = new Map<string, ClaimRecord>();
  private consents = new Map<string, ConsentRecord>();
  private dataRequests = new Map<string, DataRequestRecord>();
  private auditEntries: AuditEntry[] = [];

  async putClaim(record: ClaimRecord): Promise<void> {
    this.claims.set(record.claimId, record);
  }
  async getClaim(claimId: string): Promise<ClaimRecord | undefined> {
    return this.claims.get(claimId);
  }
  async findClaim(
    guardianUserId: string,
    childUserId: string,
  ): Promise<ClaimRecord | undefined> {
    return [...this.claims.values()].find(
      (c) => c.guardianUserId === guardianUserId && c.childUserId === childUserId,
    );
  }
  async listClaimsForChild(childUserId: string): Promise<readonly ClaimRecord[]> {
    return [...this.claims.values()].filter((c) => c.childUserId === childUserId);
  }

  async putConsent(record: ConsentRecord): Promise<void> {
    this.consents.set(record.consentId, record);
  }
  async listConsents(subjectUserId: string): Promise<readonly ConsentRecord[]> {
    return [...this.consents.values()].filter(
      (c) => c.subjectUserId === subjectUserId,
    );
  }

  async putDataRequest(record: DataRequestRecord): Promise<void> {
    this.dataRequests.set(record.requestId, record);
  }
  async getDataRequest(requestId: string): Promise<DataRequestRecord | undefined> {
    return this.dataRequests.get(requestId);
  }

  async appendAudit(entry: AuditEntry): Promise<void> {
    this.auditEntries.push(entry);
  }
  async listAudit(organizationId: string): Promise<readonly AuditEntry[]> {
    return this.auditEntries.filter((e) => e.organizationId === organizationId);
  }

  /** Current relationships, in the shape the authorization layer reads. */
  guardianRelationships(): ClaimRecord[] {
    return [...this.claims.values()];
  }
}
