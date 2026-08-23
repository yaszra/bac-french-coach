"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Badge } from "@/modules/design/ui/display";
import { Button } from "@/modules/design/ui/controls";
import { pendingCount, syncNow } from "@/modules/hifz/ui/offline-store";
import { sendQueued } from "@/modules/hifz/ui/submit-client";
import styles from "./sync.module.css";

/**
 * The honest sync state.
 *
 * It appears only when there is something true to say: attempts still on the
 * device, or no connection. It never shows a green tick for "synced" — an empty
 * queue is the normal state and deserves no celebration, and celebrating it would
 * be one more thing competing with the day's single action.
 *
 * Nothing here claims an attempt passed. A queued attempt is work the server has
 * not graded yet, and the copy says exactly that.
 */
function subscribeToConnectivity(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function isOffline(): boolean {
  return navigator.onLine === false;
}

/** On the server there is no connection to be offline from. */
function isOfflineOnServer(): boolean {
  return false;
}

export function SyncBanner() {
  const { t } = useSurface();
  const [pending, setPending] = useState(0);
  // Connectivity is external state that changes without React's involvement, so
  // it is subscribed to rather than copied into state inside an effect — which
  // would render once with the wrong answer and again with the right one.
  const offline = useSyncExternalStore(subscribeToConnectivity, isOffline, isOfflineOnServer);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);



  const drain = useCallback(async () => {
    setBusy(true);
    try {
      // The scaffold that was on screen is not known at drain time, so it is
      // reported as unknown rather than guessed — the grader treats `null` as
      // "the client cannot say", which is the truth.
      const state = await syncNow((attempt) => sendQueued(attempt, null));
      setPending(state.pending);
      setFailed(state.kind === "failing");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    // The queue lives in IndexedDB, so the first count is a read that finishes
    // after this effect does. `active` stops a late answer from writing state
    // into a component that has already gone.
    let active = true;

    async function readQueue(): Promise<void> {
      const count = await pendingCount();
      if (active) setPending(count);
    }
    void readQueue();

    // Coming back online is the moment queued work should go out.
    const goOnline = () => void drain();
    window.addEventListener("online", goOnline);
    return () => {
      active = false;
      window.removeEventListener("online", goOnline);
    };
  }, [drain]);

  if (pending === 0 && !offline) return null;

  return (
    <div className={styles.banner} role="status" data-testid="sync-banner">
      <div className={styles.text}>
        {offline ? <p className={styles.line}>{t("learner.sync.offline")}</p> : null}
        {pending > 0 ? (
          <p className={styles.line}>
            <Badge tone="caution">{t("learner.sync.pending", { count: pending })}</Badge>{" "}
            {t("learner.sync.notCounted")}
          </p>
        ) : null}
        {failed ? <p className={styles.line}>{t("learner.sync.failed")}</p> : null}
      </div>
      {pending > 0 && !offline ? (
        <Button variant="secondary" size="sm" loading={busy} onClick={() => void drain()}>
          {t("learner.sync.syncing")}
        </Button>
      ) : null}
    </div>
  );
}
