"use client";

import { useSurface } from "@/modules/design/theme/ThemeProvider";
import {
  AyahRosette,
  INK_DEPTHS,
  InkLegend,
  InkWord,
  MushafPage,
  PageFrame,
  formatArabicNumber,
  type InkWordState,
} from "@/modules/design/ui/mushaf";
import { Family, Specimen } from "./Specimen";

const STATES: readonly InkWordState[] = ["idle", "active", "correct", "lapsed"];

/**
 * The muṣḥaf family.
 *
 * SACRED-CONTENT RULE: there is no Arabic in this file. The ink specimens show
 * the depth ladder using NUMERALS produced by Intl — data, not scripture — and
 * are marked `lang="en"` so they never borrow the muṣḥaf face. The real page
 * lives at /catalogue/mushaf, where text comes from the content package or the
 * page honestly reports that nothing is recorded.
 */
export function MushafSection() {
  const { locale, t } = useSurface();

  return (
    <Family name="mushaf">
      <Specimen name="InkWord · depth 0–5">
        {INK_DEPTHS.map((depth) => (
          <InkWord
            key={depth}
            text={formatArabicNumber(locale, depth)}
            depth={depth}
            index={depth + 1}
            ayah={1}
            lang="en"
          />
        ))}
      </Specimen>

      <Specimen name="InkWord · state">
        {STATES.map((state, position) => (
          <InkWord
            key={state}
            text={formatArabicNumber(locale, position + 1)}
            depth={5}
            index={position + 1}
            ayah={2}
            state={state}
            lang="en"
          />
        ))}
      </Specimen>

      <Specimen name="InkWord · revealed">
        <InkWord text={formatArabicNumber(locale, 0)} depth={0} index={1} ayah={3} lang="en" />
        <InkWord text={formatArabicNumber(locale, 0)} depth={0} index={2} ayah={3} lang="en" revealed />
      </Specimen>

      <Specimen name="AyahRosette">
        <AyahRosette ayah={1} />
        <AyahRosette ayah={7} />
        <AyahRosette ayah={286} />
        <AyahRosette ayah={3} size="sm" />
      </Specimen>

      <Specimen name="InkLegend" column>
        <InkLegend />
      </Specimen>

      <Specimen name="PageFrame · MushafPage" wide column>
        <PageFrame
          page={1}
          header={<span>{t("state.notYetRecorded")}</span>}
          markers={[
            { kind: "juz", number: 1 },
            { kind: "hizb", number: 1 },
          ]}
        >
          <MushafPage lines={[]} />
        </PageFrame>
      </Specimen>

      <Specimen name="PageFrame · dense" wide column>
        <PageFrame page={604} dense header={<span>{t("state.notYetRecorded")}</span>}>
          <MushafPage lines={[]} />
        </PageFrame>
      </Specimen>
    </Family>
  );
}
