import { withTenant, type TenantClient } from "../db/tenant";
import { learningEventInput, parsePayload, type LearningEventInput } from "./types";

/**
 * Appending an event is the only way anything enters the learning domain.
 *
 * Idempotency is a database constraint, not a check-then-write: a replayed
 * offline attempt collides on (organizationId, idempotencyKey) and returns the
 * event that already exists. A phone that syncs the same queue twice changes
 * nothing.
 */
export type AppendResult = {
  readonly eventId: string;
  readonly deduplicated: boolean;
};

export async function appendEvent(
  input: LearningEventInput,
  tx?: TenantClient,
): Promise<AppendResult> {
  const event = learningEventInput.parse(input);
  const payload = parsePayload(event.type, event.payload);

  const write = async (client: TenantClient): Promise<AppendResult> => {
    const existing = await client.learningEvent.findUnique({
      where: {
        organizationId_idempotencyKey: {
          organizationId: event.organizationId,
          idempotencyKey: event.idempotencyKey,
        },
      },
      select: { id: true },
    });
    if (existing) return { eventId: existing.id, deduplicated: true };

    const created = await client.learningEvent.create({
      data: {
        organizationId: event.organizationId,
        learnerUserId: event.learnerUserId,
        type: event.type,
        unitId: event.unitId ?? null,
        idempotencyKey: event.idempotencyKey,
        payload: payload as object,
        occurredAt: event.occurredAt,
        source: event.source,
      },
      select: { id: true },
    });
    return { eventId: created.id, deduplicated: false };
  };

  return tx ? write(tx) : withTenant(event.organizationId, write);
}

/** Append several events atomically — a verdict and the reviews it reschedules. */
export async function appendEvents(
  organizationId: string,
  events: readonly LearningEventInput[],
): Promise<readonly AppendResult[]> {
  return withTenant(organizationId, async (tx) => {
    const results: AppendResult[] = [];
    for (const event of events) results.push(await appendEvent(event, tx));
    return results;
  });
}
