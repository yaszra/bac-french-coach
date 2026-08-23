import { getCaller } from "@/modules/identity/actions/session-context";
import { can } from "@/modules/platform/authz/can";
import { listLearners, recentBeats } from "@/modules/classroom/repo/teacher-repo";
import {
  DEFAULT_PRESENCE_CONFIG,
  encodeFrame,
  summarise,
  toFrame,
} from "@/modules/classroom/domain/presence";

/**
 * The presence stream.
 *
 * Server-sent events rather than polling, and the reason is not elegance: a
 * console left open through an evening class would otherwise make a request
 * every few seconds to be told that nothing changed. One connection costs one
 * connection.
 *
 * What travels is deliberately tiny — an id, a state, an age in seconds — and
 * it is derived from events the learners' own work already wrote. Nothing is
 * recorded to make this work, so there is nothing extra to retain, export or
 * erase. Presence is "who is working right now", and when the tab closes it is
 * simply gone.
 */
export const dynamic = "force-dynamic";

/** How often a frame is sent. Slow enough to be cheap, quick enough to be live. */
const TICK_MS = 5_000;
/** A comment line every so often, so proxies do not close an idle stream. */
const KEEPALIVE_EVERY = 6;

export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly classroomId: string }> },
): Promise<Response> {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") {
    return new Response(null, { status: 401 });
  }
  const actor = caller.actor;
  const { classroomId } = await params;

  if (!can(actor, "teach:manageClassroom", { type: "classroom", id: classroomId }).allowed) {
    return new Response(null, { status: 403 });
  }

  const learners = await listLearners(actor.organizationId, classroomId);
  const roster = learners.map((learner) => learner.userId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let ticks = 0;
      let closed = false;

      const send = async (): Promise<void> => {
        if (closed) return;
        const now = new Date();
        const since = new Date(now.getTime() - DEFAULT_PRESENCE_CONFIG.presentWithinSeconds * 1000);
        const beats = await recentBeats(actor.organizationId, roster, since);
        const entries = summarise(roster, beats, now);
        try {
          controller.enqueue(encoder.encode(encodeFrame(toFrame(entries, now))));
          if (ticks % KEEPALIVE_EVERY === 0) controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
        ticks += 1;
      };

      await send();
      const timer = setInterval(() => {
        void send().catch(() => {
          closed = true;
        });
      }, TICK_MS);

      // The abort path: when the teacher navigates away the stream is cancelled
      // and the interval has to go with it, or the server keeps querying for a
      // console nobody is looking at.
      const stop = (): void => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      _request.signal.addEventListener("abort", stop);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
