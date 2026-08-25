import { z } from "zod";

export const signInInput = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(512),
});
export type SignInInput = z.infer<typeof signInInput>;

/** Children sign in with a code an adult gives them — no email, no typing. */
export const codeSignInInput = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{6,10}$/, "code must be 6–10 letters or digits"),
});

export const claimChildInput = z.object({
  learnerCode: z.string().trim().regex(/^[A-Z0-9]{6,10}$/),
  relationship: z.enum(["mother", "father", "guardian"]),
});

export const joinClassroomInput = z.object({
  joinCode: z.string().trim().regex(/^[A-Z0-9]{6,10}$/),
});
