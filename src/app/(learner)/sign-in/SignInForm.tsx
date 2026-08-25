"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSurface } from "@/modules/design/theme/ThemeProvider";
import { Button, Field, Input } from "@/modules/design/ui/controls";
import styles from "./sign-in.module.css";

type Mode = "email" | "code";

/**
 * Two ways in, because two kinds of person sign in here.
 *
 * An adult or an older learner types an address and a password. A child is read
 * a code by a grown-up: no email, no password, nothing to remember. The failure
 * copy is identical either way — it never says whether an account exists.
 */
export function SignInForm({
  onEmail,
  onCode,
}: {
  readonly onEmail: (form: FormData) => Promise<{ ok: boolean; error?: string }>;
  readonly onCode: (form: FormData) => Promise<{ ok: boolean; error?: string }>;
}) {
  const { t } = useSurface();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("email");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = mode === "email" ? await onEmail(form) : await onCode(form);
      if (result.ok) {
        router.replace("/today");
        router.refresh();
        return;
      }
      setError(
        result.error === "rate_limited"
          ? t("learner.signIn.error.tooManyTries")
          : result.error === "locked"
            ? t("learner.signIn.error.locked")
            : t("learner.signIn.error.notRecognised"),
      );
    });
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      {mode === "email" ? (
        <>
          <Field label={t("learner.signIn.email")}>
            {(control) => (
              <Input
                {...control}
                name="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                data-testid="sign-in-email"
              />
            )}
          </Field>
          <Field label={t("learner.signIn.password")}>
            {(control) => (
              <Input
                {...control}
                name="password"
                type="password"
                autoComplete="current-password"
                data-testid="sign-in-password"
              />
            )}
          </Field>
        </>
      ) : (
        <Field label={t("learner.signIn.code")} description={t("learner.signIn.codeHint")}>
          {(control) => (
            <Input {...control} name="code" autoComplete="one-time-code" data-testid="sign-in-code" />
          )}
        </Field>
      )}

      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" fullWidth loading={pending} data-testid="sign-in-submit">
        {t("learner.signIn.submit")}
      </Button>

      <Button
        type="button"
        variant="quiet"
        fullWidth
        onClick={() => {
          setError(null);
          setMode(mode === "email" ? "code" : "email");
        }}
      >
        {mode === "email" ? t("learner.signIn.useCode") : t("learner.signIn.useEmail")}
      </Button>
    </form>
  );
}
