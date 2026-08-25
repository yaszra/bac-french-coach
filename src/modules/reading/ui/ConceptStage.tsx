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
 * A side view of the mouth: lips at the start of the line, throat at its end.
 *
 * The coordinates are drawing coordinates, not anatomy, and the caption names the
 * makhraj in words so nothing rests on a reader interpreting a picture.
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
  const cx = 20 + x * 200;
  const cy = 20 + y * 100;

  return (
    <svg
      className={styles.diagram}
      viewBox="0 0 240 150"
      role="img"
      aria-label={t("reading.a11y.mouthDiagram", { label })}
    >
      {/* Palate and jaw: one open profile, lips on the right of the drawing. */}
      <path className={styles.mouthOutline} d="M18 46c34-22 96-30 148-18 24 6 44 16 56 30" />
      <path className={styles.mouthOutline} d="M18 118c34 18 96 24 148 12 24-6 44-14 56-26" />
      <path className={styles.mouthTongue} d="M34 104c26-18 62-22 98-14 20 4 36 10 48 18" />
      <circle className={styles.articulationHalo} cx={cx} cy={cy} r={12} />
      <circle className={styles.articulation} cx={cx} cy={cy} r={5} />
    </svg>
  );
}
