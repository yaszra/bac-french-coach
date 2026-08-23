/**
 * The memorization workspace.
 *
 * Composes the nine-stage loop into one screen. Layout rules from docs/03:
 * the muṣḥaf is visually dominant, the tile tray sits below it and never
 * over it, and nothing — chip, tooltip, celebration — overlaps the page.
 *
 * Only the current stage and the immediate next step are shown. A learner
 * looking at all nine stages at once is being asked to plan, which is the
 * job this screen exists to do for them.
 */
import { useState } from "react";
import type { ScaffoldLevel } from "../../core/types.js";
import { useLocale } from "../i18n/context.js";
import type { MessageKey } from "../i18n/messages.js";
import { MushafPage, type RenderableLine } from "./MushafPage.js";
import { TileTray, type Tile } from "./TileTray.js";
import { AssistanceControl } from "./AssistanceControl.js";
import { ScaffoldLadder } from "./ScaffoldLadder.js";

export const SESSION_STAGES = [
  "orient",
  "listen",
  "reconstruct",
  "withdraw",
  "prove",
  "connect",
  "recite",
  "verify",
  "retain",
] as const;

export type SessionStage = (typeof SESSION_STAGES)[number];

export interface MemorizationSessionProps {
  stage: SessionStage;
  pageNumber: number;
  lines: readonly RenderableLine[];
  /** Empty at the start of every session. */
  revealedTokenIds: readonly string[];
  passageLabel: string;
  scaffoldLevel: ScaffoldLevel;
  lastLadderChange?: "advanced" | "retreated" | "held";
  listens: { done: number; required: number };
  tiles: readonly Tile[];
  assistanceUsed: boolean;
  onListen: () => void;
  onPlaceTile: (tokenId: string) => void;
  onUseHint: () => void;
}

export function MemorizationSession({
  stage,
  pageNumber,
  lines,
  revealedTokenIds,
  passageLabel,
  scaffoldLevel,
  lastLadderChange,
  listens,
  tiles,
  assistanceUsed,
  onListen,
  onPlaceTile,
  onUseHint,
}: MemorizationSessionProps) {
  const { t } = useLocale();
  const stageIndex = SESSION_STAGES.indexOf(stage);
  const [announcedBlank] = useState(revealedTokenIds.length === 0);

  // Tiles are offered only where the scaffold actually shows answers.
  const showTiles =
    stage === "reconstruct" || scaffoldLevel === "full_tiles" ||
    scaffoldLevel === "fewer_tiles_with_anchors";

  return (
    <main className="athar-session">
      {/*
        The session rail: stage and progress only. No settings, no
        assignment configuration — those are adult decisions, made
        elsewhere and not editable here.
      */}
      <nav className="athar-session__rail" aria-label={t("session.stage", {
        current: stageIndex + 1,
        total: SESSION_STAGES.length,
      })}>
        <p className="athar-session__stage-count">
          {t("session.stage", { current: stageIndex + 1, total: SESSION_STAGES.length })}
        </p>
        <p className="athar-session__stage-name">
          {t(`session.stage.${stage}` as MessageKey)}
        </p>
        <ScaffoldLadder level={scaffoldLevel} {...(lastLadderChange ? { lastChange: lastLadderChange } : {})} />
      </nav>

      {/* The muṣḥaf, dominant and unobstructed. */}
      <div className="athar-session__page">
        {announcedBlank ? (
          <p className="athar-session__blank-notice">{t("session.blankPage")}</p>
        ) : null}
        <MushafPage
          pageNumber={pageNumber}
          lines={lines}
          revealedTokenIds={revealedTokenIds}
          label={passageLabel}
        />
        {/*
          The tray is a sibling *after* the page in the DOM and in reading
          order — never a child of it, and never absolutely positioned over
          it.
        */}
        {showTiles ? (
          <TileTray tiles={tiles} onPlace={onPlaceTile} disabled={tiles.length === 0} />
        ) : null}
      </div>

      {/* Contextual actions. On small screens this becomes a bottom sheet. */}
      <aside className="athar-session__actions" aria-label={t("session.stage.listen")}>
        <button type="button" className="athar-session__play" onClick={onListen}>
          {t("session.play")}
        </button>
        <p className="athar-session__listens">
          {t("session.listenCount", {
            done: listens.done,
            required: listens.required,
          })}
        </p>
        <AssistanceControl onUse={onUseHint} used={assistanceUsed} />
      </aside>
    </main>
  );
}
