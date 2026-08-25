// Structural facts about the muṣḥaf. These are NUMBERS, not scripture: the
// count of āyahs in each sūrah, in order, under the Ḥafṣ ʿUthmānī numbering.
// They exist so a gate can prove a downloaded corpus is complete and correctly
// divided without anyone having to read 6236 lines of Arabic.
export const AYAH_COUNTS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111,
  110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45,
  83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55,
  78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20,
  56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21,
  11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

export const SURA_COUNT = 114;
export const AYAH_TOTAL = 6236;
export const PAGE_COUNT = 604;
export const JUZ_COUNT = 30;

/** Sūrah 9 is the one sūrah with no basmalah; 27:30 contains one inside an āyah. */
export const SURA_WITHOUT_BASMALAH = 9;

export function expectedAyahCount(sura) {
  const count = AYAH_COUNTS[sura - 1];
  if (count === undefined) throw new Error(`sura ${sura} is out of range`);
  return count;
}
