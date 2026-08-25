import { redirect } from "next/navigation";
import { getCaller } from "@/modules/identity/actions/session-context";
import { signIn, signInWithCode } from "@/modules/identity/actions/sign-in";
import { translator } from "@/modules/platform/i18n/translate";
import { SignInForm } from "./SignInForm";
import styles from "./sign-in.module.css";

/**
 * Signing in.
 *
 * The server actions are wrapped rather than passed straight through: the client
 * needs to know only whether it worked and, at most, a reason category. It never
 * receives a user id, an organisation or anything else it could act on.
 */
async function withEmail(form: FormData): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const result = await signIn(form);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

async function withCode(form: FormData): Promise<{ ok: boolean; error?: string }> {
  "use server";
  const result = await signInWithCode(form);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export default async function SignInPage() {
  const caller = await getCaller();
  if (caller.kind === "authenticated") redirect("/today");
  const t = translator("en");

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div>
          <p className={styles.eyebrow}>{t("app.name")}</p>
          <h1 className={styles.title}>{t("learner.signIn.title")}</h1>
        </div>
        <SignInForm onEmail={withEmail} onCode={withCode} />
      </div>
    </main>
  );
}
