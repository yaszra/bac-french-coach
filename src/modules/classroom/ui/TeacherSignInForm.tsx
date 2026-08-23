"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input } from "../../design/ui/controls";
import { useSurface } from "../../design/theme/ThemeProvider";
import { signIn } from "../../identity/actions/sign-in";
import styles from "./TeacherConsole.module.css";

/**
 * Signing in.
 *
 * The failure message is the same whichever way it failed, because telling a
 * stranger that an address exists is telling them half a credential. The one
 * exception is the rate limit, which is about them rather than about anyone's
 * account.
 */
export function TeacherSignInForm() {
  const { t } = useSurface();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (formData: FormData): void => {
    setError(null);
    startTransition(async () => {
      const result = await signIn(formData);
      if (result.ok) {
        router.push("/teacher/today");
        router.refresh();
        return;
      }
      setError(
        t(
          result.error === "rate_limited"
            ? "teacher.signIn.rateLimited"
            : result.error === "locked"
              ? "teacher.signIn.locked"
              : "teacher.signIn.failed",
        ),
      );
    });
  };

  return (
    <form action={submit} className={styles.card}>
      <h1 className={styles.title}>{t("teacher.signIn.title")}</h1>
      <p className={styles.sectionNote}>{t("teacher.signIn.lede")}</p>
      <div className={styles.stack}>
        <Field label={t("teacher.signIn.email")}>
          <Input name="email" type="email" autoComplete="username" required />
        </Field>
        <Field label={t("teacher.signIn.password")}>
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        {error === null ? null : (
          <p role="alert" className={styles.meta}>
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" loading={pending}>
          {t("teacher.signIn.submit")}
        </Button>
      </div>
    </form>
  );
}
