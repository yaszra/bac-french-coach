import type { Translate } from "@/modules/platform/i18n/translate";

import { conceptById, letterById, makhrajById, type ConceptId } from "../domain/concepts";
import { facetsOf } from "../domain/confusion";
import { conceptGlyph, conceptLabel, makhrajLabel, regionLabel } from "./concept-label";
import { articulationPoint, placeOfLetter } from "./makhraj-view";
import styles from "./reading.module.css";

/**
 * One concept, shown: the letter itself, and where in the mouth it is made.
 *
 * The diagram is a schematic profile — lips at one end, throat at the other — with a
 * single mark at the letter's makhraj, taken from the lattice rather than drawn by
 * hand per letter. It is calm on purpose: one slow settle for the letter, one quiet
 * pulse at the articulation point, and both stop dead under
 * `prefers-reduced-motion`. There is no bounce and there is no confetti, because a
 * child learning the letters of the Qurʾān is not being sold anything.
 *
 * The glyph is teaching data: a letter, or a letter carrying one mark, straight from
 * the lattice. Nothing is composed into a word here.
 */
export function ConceptStage({
  conceptId,
  t,
}: {
  readonly conceptId: ConceptId;
  readonly t: Translate;
}) {
  const concept = conceptById(conceptId);
  const letter = facetsOf(conceptId).letter ?? letterById(conceptId);
  const makhraj = concept?.makhraj ?? letter?.makhraj ?? null;
  const place = letter === null ? null : placeOfLetter(letter);
  const label = conceptLabel(t, conceptId);
  const glyph = conceptGlyph(conceptId);

  return (
    <div className={styles.stage}>
      <div className={styles.stageGlyph}>
        <span className={styles.glyphLarge} lang="ar" dir="rtl" aria-hidden="true">
          {glyph}
        </span>
        <span className={styles.letterName}>{label}</span>
        {letter === null ? null : (
          <span className={styles.letterMeta}>{t("reading.letters.unicode", { unicode: letter.unicode })}</span>
        )}
      </div>

      <div>
        {makhraj === null ? (
          <p className={styles.note}>{t("reading.smartscore.noEvidence")}</p>
        ) : (
          <>
            <MouthDiagram label={label} x={articulationPoint(makhraj).x} y={articulationPoint(makhraj).y} t={t} />
            <p className={styles.note}>{t("reading.intro.madeAt", { place: makhrajLabel(t, makhraj) })}</p>
            {place === null || makhrajById(makhraj) === null ? null : (
              <p className={styles.quiet}>
                {t("reading.intro.region", {
                  region: regionLabel(t, makhrajById(makhraj)?.region ?? "jawf"),
                })}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A side view of the mouth: the throat at one end, the lips at the other.
 *
 * The two ends are labelled in words, because a schematic that relies on the reader
 * interpreting a shape teaches nothing. The mark sits at the letter's makhraj, taken
 * from the lattice; the caption underneath names that makhraj, so the picture is a
 * reinforcement of the words and never the only carrier of the meaning.
 */
function MouthDiagram({
  label,
  x,
  y,
  t,
}: {
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly t: Translate;
}) {
  const cx = 26 + x * 176;
  const cy = 34 + y * 74;

  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 150"
      role="img"
      aria-label={t("reading.a11y.mouthDiagram", { label })}
    >
      {/* The palate, arching forward from the throat to behind the upper lip. */}
      <path className={styles.mouthOutline} d="M22 40c14-14 44-22 84-22 40 0 74 8 100 20" />
      {/* The lips, at the forward end. */}
      <path className={styles.mouthOutline} d="M206 38c10 4 12 14 12 22s-2 18-12 22" />
      {/* The jaw and the floor of the mouth. */}
      <path className={styles.mouthOutline} d="M22 122c14 12 44 18 84 18 40 0 74-6 100-18" />
      {/* The tongue: a low mound, deepest at the back. */}
      <path className={styles.mouthTongue} d="M40 112c22-22 58-30 96-26 24 3 44 9 58 16" />
      {/* The throat, at the deep end. */}
      <path className={styles.mouthOutline} d="M22 40c-6 12-6 30 0 42" />

      <circle className={styles.articulationHalo} cx={cx} cy={cy} r={13} />
      <circle className={styles.articulation} cx={cx} cy={cy} r={5} />

      <text className={styles.diagramLabel} x={10} y={144} textAnchor="start">
        {t("reading.diagram.throat")}
      </text>
      <text className={styles.diagramLabel} x={230} y={144} textAnchor="end">
        {t("reading.diagram.lips")}
      </text>
    </svg>
  );
}
