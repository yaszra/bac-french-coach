"use client";

import { useState, useTransition } from "react";
import { useSurface } from "../../design/theme/ThemeProvider";
import { Button, Field, Input } from "../../design/ui/controls";
import { Badge } from "../../design/ui/display";
import { submitClaim, type ClaimActionResult } from "../actions/family-actions";
import { PendingClaim } from "./ChildrenView";
import styles from "./family.module.css";

/**
 * Asking to be linked to a child.
 *
 * The result screen distinguishes the two outcomes on purpose: "the teacher has
 * your request" and "there was no teacher to ask, so you are linked" are
 * different facts, and showing one reassuring sentence for both would be the
 * dishonest version of this feature.
 */
export function LinkForm() {
  const { t } = useSurface();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ClaimActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div className={styles.stack}>
        <div className={styles.card}>
          <div className={styles.rowBetween}>
            <h2 className={styles.headline}>{result.childName}</h2>
            <Badge tone={result.state === "approved" ? "success" : "caution"} dot>
              {t(result.state === "approved" ? "family.children.approved" : "family.children.pending")}
            </Badge>
          </div>
          <p className={styles.sentence}>{t(result.messageKey, { child: result.childName })}</p>
          {result.state === "claimed" ? <PendingClaim childName={result.childName} /> : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <p className={styles.sentence}>{t("family.link.intro")}</p>
      <div className={styles.form}>
        <Field
          label={t("family.link.codeLabel")}
          description={t("family.link.codeHelp")}
          {...(result && !result.ok ? { error: t(result.errorKey) } : {})}
        >
          <Input
            value={code}
            autoComplete="off"
            inputMode="text"
            onChange={(event) => setCode(event.target.value)}
          />
        </Field>
        <div className={styles.actions}>
          <Button
            loading={pending}
            onClick={() =>
              startTransition(async () => {
                setResult(await submitClaim(code));
              })
            }
          >
            {t("family.link.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}
