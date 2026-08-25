import { redirect } from "next/navigation";

import { getCaller } from "@/modules/identity/actions/session-context";
import { LearnerShell } from "@/modules/design/shells";
import { LinkButton } from "@/modules/design/ui/controls";
import { translator, type Translate } from "@/modules/platform/i18n/translate";
import { getTalqinFor } from "@/modules/reading/actions/reading-session";
import { makhrajRegions } from "@/modules/reading/ui/makhraj-view";
import { conceptLabel, makhrajLabel, regionLabel } from "@/modules/reading/ui/concept-label";
import { TalqinPlayer, type TalqinView } from "@/modules/reading/ui/TalqinPlayer";
import { ARABIC_LETTERS, type ArabicLetter } from "@/modules/reading/domain/concepts";
import styles from "@/modules/reading/ui/reading.module.css";

import { LEARNER_NAV } from "../../nav";
import { readingHref } from "../href";

/**
 * Every letter, arranged by where it is made.
 *
 * Throat, tongue, lips, nose — the ordering a teacher actually uses, taken from the
 * lattice's makhraj data rather than written out again here. Each letter shows its
 * name, its makhraj and its model pronunciation.
 *
 * Where no recording exists the card says "not yet recorded" and offers the next step.
 * A synthesized voice is never substituted for a reciter, so a silent card is the
 * correct card until a person records one.
 */
export default async function LettersPage() {
  const caller = await getCaller();
  if (caller.kind !== "authenticated") redirect("/sign-in");
  const actor = caller.actor;
  const t = translator(actor.locale);

  const regions = makhrajRegions();
  const { resolutions, srcById } = await getTalqinFor(
    actor.organizationId,
    actor.userId,
    ARABIC_LETTERS.map((letter) => letter.id),
  );

  const talqinOf = (letter: ArabicLetter): TalqinView => {
    const resolution = resolutions.get(letter.id);
    if (resolution === undefined || resolution.kind === "not_yet_recorded") {
      return {
        kind: "not_yet_recorded",
        reasonKey: resolution?.reason.key ?? "reading.talqin.reason.not_yet_recorded",
      };
    }
    const src = srcById.get(resolution.asset.assetId);
    if (src === undefined) {
      return { kind: "not_yet_recorded", reasonKey: "reading.talqin.reason.not_yet_recorded" };
    }
    return {
      kind: "resolved",
      src,
      provenanceLabelKey: resolution.provenanceLabelKey,
      isMachineVoice: resolution.isMachineVoice,
    };
  };

  return (
    <LearnerShell active="reading" items={LEARNER_NAV}>
      <div className={styles.page}>
        <div className={styles.inner} data-testid="reading-letters">
          <header>
            <p className={styles.eyebrow}>{t("reading.title")}</p>
            <h1 className={styles.heading}>{t("reading.letters.title")}</h1>
            <p className={styles.lede}>{t("reading.letters.body")}</p>
          </header>

          <div className={styles.regions}>
            {regions.map((region) => (
              <section key={region.region} className={styles.panel} data-testid="reading-region">
                <p className={styles.panelTitle}>{regionLabel(t, region.region)}</p>
                <p className={styles.quiet}>{t("reading.letters.letterCount", { count: region.letterCount })}</p>
                <div className={styles.places}>
                  {region.places.map((place) => (
                    <div key={place.id} className={styles.place}>
                      <p className={styles.note}>{makhrajLabel(t, place.id)}</p>
                      {place.letters.length === 0 ? (
                        <p className={styles.quiet}>{t("reading.letters.noLetters")}</p>
                      ) : (
                        <div className={styles.letterGrid}>
                          {place.letters.map((letter) => (
                            <LetterCard key={letter.id} letter={letter} talqin={talqinOf(letter)} t={t} />
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          <div className={styles.actions}>
            <LinkButton href={readingHref()} variant="secondary">
              {t("reading.title")}
            </LinkButton>
          </div>
        </div>
      </div>
    </LearnerShell>
  );
}

function LetterCard({
  letter,
  talqin,
  t,
}: {
  readonly letter: ArabicLetter;
  readonly talqin: TalqinView;
  readonly t: Translate;
}) {
  return (
    <div className={styles.letterCard} data-testid="reading-letter" data-letter={letter.name}>
      <span className={styles.glyph} lang="ar" dir="rtl" aria-hidden="true">
        {letter.codepoint}
      </span>
      <span className={styles.letterName}>{conceptLabel(t, letter.id)}</span>
      <span className={styles.letterMeta}>{t("reading.letters.unicode", { unicode: letter.unicode })}</span>
      <TalqinPlayer talqin={talqin} compact />
    </div>
  );
}
