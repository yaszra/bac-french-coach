import { z } from "zod";

/**
 * The content package is READ-ONLY at runtime. These schemas exist so that a
 * corrupted or partial package is caught at the boundary, once, rather than
 * producing a page with a gap in it.
 */
export const ayah = z.object({
  sura: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1),
  text: z.string().min(1),
});
export type Ayah = z.infer<typeof ayah>;

export const corpus = z.array(ayah).length(6236);

export const pageRange = z.object({
  sura: z.number().int().min(1).max(114),
  ayahFrom: z.number().int().min(1),
  ayahTo: z.number().int().min(1),
});

export const mushafPage = z.object({
  page: z.number().int().min(1).max(604),
  firstAyahId: z.number().int().min(1),
  lastAyahId: z.number().int().min(1),
  ranges: z.array(pageRange).min(1),
  /** Line breaks are honestly absent until measured. */
  lines: z.union([z.literal("not_yet_recorded"), z.array(z.array(z.number().int()))]),
});
export type MushafPage = z.infer<typeof mushafPage>;

export const layout = z.object({
  id: z.string(),
  pageCount: z.number().int(),
  linesPerPage: z.number().int(),
  containsArabic: z.literal(false),
  pages: z.array(mushafPage),
  juz: z.array(
    z.object({
      juz: z.number().int().min(1).max(30),
      startsAt: z.object({ sura: z.number().int(), ayah: z.number().int() }),
      ayahId: z.number().int(),
    }),
  ),
  sajdas: z.array(
    z.object({
      index: z.number().int(),
      sura: z.number().int(),
      ayah: z.number().int(),
      ayahId: z.number().int(),
    }),
  ),
});

export const source = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("vendored"),
    sourceId: z.string(),
    label: z.string(),
    publisher: z.string(),
    url: z.string(),
    fetchedAt: z.string(),
    corpusSha256: z.string(),
    ayahCount: z.number().int(),
  }),
  z.object({
    state: z.literal("not_yet_fetched"),
    reason: z.string(),
  }),
]);
