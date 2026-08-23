"use client";

import { useEffect, useState } from "react";
import type { PresenceFrame, PresenceState } from "../domain/presence";

/**
 * The live presence feed.
 *
 * Server-sent events, not polling: a teacher's console sits open for an hour,
 * and a poll would mean hundreds of requests to learn that nothing changed.
 * One connection, a frame when something moves, and a heartbeat comment to
 * keep proxies from closing it.
 *
 * The hook holds only the latest frame. There is no history buffer, because
 * presence has no history worth keeping — that would be telemetry, which this
 * is deliberately not.
 */
export type PresenceEntryView = {
  readonly learnerUserId: string;
  readonly state: PresenceState;
  readonly secondsSince: number;
};

export type PresenceStatus = "connecting" | "live" | "lost";

export type PresenceFeed = {
  readonly status: PresenceStatus;
  readonly entries: readonly PresenceEntryView[];
};

function parseFrame(raw: string): readonly PresenceEntryView[] | null {
  try {
    const frame = JSON.parse(raw) as PresenceFrame;
    if (!Array.isArray(frame.entries)) return null;
    return frame.entries.flatMap((entry) =>
      Array.isArray(entry) && typeof entry[0] === "string"
        ? [{ learnerUserId: entry[0], state: entry[1], secondsSince: entry[2] }]
        : [],
    );
  } catch {
    return null;
  }
}

export function usePresence(classroomId: string): PresenceFeed {
  // A browser with no EventSource can never connect, so that is the state this
  // hook starts in — not a state it corrects itself into after first render.
  const [status, setStatus] = useState<PresenceStatus>(() =>
    typeof EventSource === "undefined" ? "lost" : "connecting",
  );
  const [entries, setEntries] = useState<readonly PresenceEntryView[]>([]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`/teacher/api/presence/${encodeURIComponent(classroomId)}`);

    source.onopen = () => setStatus("live");
    source.onmessage = (event: MessageEvent<string>) => {
      const parsed = parseFrame(event.data);
      if (parsed === null) return;
      setStatus("live");
      setEntries(parsed);
    };
    /* EventSource reconnects on its own; the state says so plainly rather than
       pretending the last frame is still true. */
    source.onerror = () => setStatus("lost");

    return () => source.close();
  }, [classroomId]);

  return { status, entries };
}
