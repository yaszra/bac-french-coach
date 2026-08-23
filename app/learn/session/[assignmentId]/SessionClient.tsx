"use client";

/**
 * Client half of the session.
 *
 * Holds only presentation state: which words are revealed *in this
 * session*, which rung of the ladder we are on, and whether assistance was
 * used in the current attempt. None of it is authoritative — every
 * meaningful outcome goes through a server action, and the server decides
 * what the attempt counted as.
 *
 * The revealed set is deliberately component state and never persisted:
 * that is the blank-page rule, expressed as an absence of code.
 */
import { useState, useTransition } from "react";
import {
  MemorizationSession,
  type SessionStage,
} from "../../../../src/ui/components/MemorizationSession.js";
import type { RenderableLine } from "../../../../src/ui/components/MushafPage.js";
import type { Tile } from "../../../../src/ui/components/TileTray.js";
import {
  applyAttemptToLadder,
  initialLadder,
  type LadderState,
} from "../../../../src/core/session.js";
import type { AttemptId, MemoryTargetId } from "../../../../src/core/types.js";
import { listenCompleted, submitAttempt } from "../../../actions.js";

export interface SessionClientProps {
  assignmentId: string;
  segmentId: string;
  pageNumber: number;
  lines: readonly RenderableLine[];
  passageLabel: string;
  listens: { done: number; required: number };
  tiles: readonly Tile[];
}

export function SessionClient({
  assignmentId,
  segmentId,
  pageNumber,
  lines,
  passageLabel,
  listens,
  tiles,
}: SessionClientProps) {
  const [revealed, setRevealed] = useState<string[]>([]);
  const [ladder, setLadder] = useState<LadderState>(initialLadder());
  const [lastChange, setLastChange] =
    useState<"advanced" | "retreated" | "held" | undefined>(undefined);
  const [assistanceUsed, setAssistanceUsed] = useState(false);
  const [remaining, setRemaining] = useState<readonly Tile[]>(tiles);
  const [, startTransition] = useTransition();

  const stage: SessionStage =
    listens.done < listens.required ? "listen" : "reconstruct";

  const placeTile = (tokenId: string) => {
    const tile = remaining.find((t) => t.tokenId === tokenId);
    if (!tile) return;

    // Revealing is a display effect. The evidence record is the server's.
    setRevealed((current) => [...current, tokenId]);
    setRemaining((current) => current.filter((t) => t.tokenId !== tokenId));

    const transition = applyAttemptToLadder(ladder, {
      attemptId: tokenId as AttemptId,
      targetId: assignmentId as MemoryTargetId,
      occurredAt: Date.now(),
      scaffoldLevel: ladder.level,
      startContext: "serial_start",
      correct: true,
      assistance: assistanceUsed ? ["tile_options_visible", "hint"] : ["tile_options_visible"],
      hesitant: false,
    });
    setLadder(transition.state);
    setLastChange(transition.changed);

    startTransition(() => {
      void submitAttempt({
        assignmentId,
        segmentId,
        scaffoldLevel: ladder.level,
        startContext: "serial_start",
        correct: true,
        // Tiles always show answer options, so the attempt is scaffolded
        // whatever else happened. The server reaches the same conclusion
        // independently; this is a report, not a claim.
        assistance: assistanceUsed
          ? ["tile_options_visible", "hint"]
          : ["tile_options_visible"],
        hesitant: false,
        idempotencyKey: `${assignmentId}:${tokenId}:${revealed.length}`,
      });
    });
  };

  return (
    <MemorizationSession
      stage={stage}
      pageNumber={pageNumber}
      lines={lines}
      revealedTokenIds={revealed}
      passageLabel={passageLabel}
      scaffoldLevel={ladder.level}
      {...(lastChange ? { lastLadderChange: lastChange } : {})}
      listens={listens}
      tiles={remaining}
      assistanceUsed={assistanceUsed}
      onListen={() =>
        startTransition(() => {
          void listenCompleted(assignmentId, segmentId);
        })
      }
      onPlaceTile={placeTile}
      onUseHint={() => setAssistanceUsed(true)}
    />
  );
}
