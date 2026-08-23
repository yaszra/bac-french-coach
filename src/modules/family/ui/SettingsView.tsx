"use client";

import { useState, useTransition } from "react";
import { useSurface } from "../../design/theme/ThemeProvider";
import { Button, Switch } from "../../design/ui/controls";
import { Badge, EmptyState } from "../../design/ui/display";
import type { ConsentSummary } from "../domain/consent";
import { addDays } from "../domain/consent";
import type { DataRequestRow } from "../repo/privacy-repo";
import { requestData, updateConsent } from "../actions/family-actions";
import styles from "./family.module.css";

/**
 * Consent and data rights, from the guardian's side.
 *
 * Two rules govern this screen. Recording is off until a guardian turns it on,
 * and retention is shown as a date rather than a policy. And a request shows
 * the state the row is actually in — a request that failed says "failed", not
 * "we'll be in touch".
 */
export function SettingsView({
  childName,
  learnerUserId,
  consents,
  requests,
  now,
}: {
  readonly childName: string;
  readonly learnerUserId: string;
  readonly consents: readonly ConsentSummary[];
  readonly requests: readonly DataRequestRow[];
  readonly now: Date;
}) {
  const { t, locale } = useSurface();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState(() => new Map(consents.map((c) => [c.purpose, c.state === "granted"])));

  const voice = consents.find((c) => c.purpose === "voice_recording");
  const dateFormat = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" });

  const toggle = (purpose: ConsentSummary["purpose"], granted: boolean) => {
    setState((current) => new Map(current).set(purpose, granted));
    startTransition(async () => {
      await updateConsent({ learnerUserId, purpose, granted });
    });
  };

  return (
    <div className={styles.stack}>
      <section className={styles.card}>
        <h2 className={styles.headline}>{t("family.settings.consentHeading", { child: childName })}</h2>
        <p className={styles.sentence}>{t("family.settings.consentDescription")}</p>
        <Switch
          label={t("family.settings.consentLabel")}
          checked={state.get("voice_recording") ?? false}
          disabled={pending}
          onCheckedChange={(checked) => toggle("voice_recording", checked)}
        />
        <p className={styles.quiet}>
          {t("family.settings.retention", { days: voice?.retentionDays ?? 90 })}
        </p>
        <p className={styles.quiet}>
          {state.get("voice_recording") === true
            ? t("family.settings.purgeOn", {
                date: dateFormat.format(addDays(now, voice?.retentionDays ?? 90)),
              })
            : voice?.state === "withdrawn"
              ? t("family.settings.withdrawn")
              : t("family.settings.neverRecorded")}
        </p>
      </section>

      <section className={styles.card}>
        <h2 className={styles.headline}>{t("family.settings.commsHeading")}</h2>
        <Switch
          label={t("family.settings.consentEmail")}
          checked={state.get("comms_email") ?? false}
          disabled={pending}
          onCheckedChange={(checked) => toggle("comms_email", checked)}
        />
        <Switch
          label={t("family.settings.consentWhatsapp")}
          checked={state.get("comms_whatsapp") ?? false}
          disabled={pending}
          onCheckedChange={(checked) => toggle("comms_whatsapp", checked)}
        />
      </section>

      <section className={styles.card}>
        <h2 className={styles.headline}>{t("family.settings.dataHeading", { child: childName })}</h2>
        <div className={styles.actions}>
          <Button
            variant="secondary"
            loading={pending}
            onClick={() => startTransition(async () => void (await requestData({ learnerUserId, kind: "export" })))}
          >
            {t("family.settings.export")}
          </Button>
          <Button
            variant="danger"
            loading={pending}
            onClick={() => startTransition(async () => void (await requestData({ learnerUserId, kind: "erasure" })))}
          >
            {t("family.settings.erase")}
          </Button>
        </div>
        <p className={styles.note}>{t("family.settings.eraseWarning", { child: childName })}</p>

        <hr className={styles.divider} />
        <p className={styles.eyebrow}>{t("family.settings.requests")}</p>
        {requests.length === 0 ? (
          <EmptyState title={t("family.settings.noRequests")} headingLevel={3} />
        ) : (
          <ul className={styles.list}>
            {requests.map((request) => (
              <li key={request.id} className={styles.listItem}>
                <div className={styles.rowBetween}>
                  <strong>{t(`family.settings.${request.kind === "export" ? "export" : "erase"}`)}</strong>
                  <Badge tone={toneFor(request.state)} dot>
                    {t(`family.settings.requestState.${request.state}`)}
                  </Badge>
                </div>
                <span className={styles.quiet}>
                  {t("family.settings.requestedOn", { date: dateFormat.format(request.requestedAt) })}
                </span>
                {request.completedAt ? (
                  <span className={styles.quiet}>
                    {t("family.settings.completedOn", { date: dateFormat.format(request.completedAt) })}
                  </span>
                ) : null}
                {request.failureReason ? (
                  <span className={styles.quiet}>
                    {t("family.settings.failedBecause", { reason: request.failureReason })}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function toneFor(state: DataRequestRow["state"]): "neutral" | "accent" | "success" | "danger" {
  if (state === "completed") return "success";
  if (state === "failed") return "danger";
  if (state === "running") return "accent";
  return "neutral";
}
