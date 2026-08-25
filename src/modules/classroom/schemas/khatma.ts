import { z } from "zod";
import { CORRECTIONS } from "../../assessment/domain/taxonomy";

/**
 * A khatma flag is a POSITION and a category. Never a piece of text, and never
 * a recording of what was said — a teacher listening to a whole juzʾ needs to
 * drop a pin and keep listening, and to find that pin again next week.
 */
export const flagPosition = z.strictObject({
  sura: z.number().int().min(1).max(114),
  ayah: z.number().int().min(1).max(286),
  wordIndex: z.number().int().nonnegative().max(200).optional(),
});

export const dropFlagInput = z.strictObject({
  learnerUserId: z.string().min(1),
  position: flagPosition,
  category: z.enum(CORRECTIONS.map((c) => c.category) as [string, ...string[]]),
  note: z.string().max(300).optional(),
});

export const resolveFlagInput = z.strictObject({
  flagId: z.string().min(1),
});

export type DropFlagInput = z.infer<typeof dropFlagInput>;
