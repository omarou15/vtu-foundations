/**
 * Schema de sortie du router (mode="router") — fallback Flash-Lite.
 * Le router déterministe traite ~95% des cas sans LLM (cf. router.ts).
 */
import { z } from "zod";

export const RouterOutputSchema = z.object({
  route: z.enum(["ignore", "extract", "conversational"]),
  reason: z.string().min(1).max(160),
});

export type RouterOutput = z.infer<typeof RouterOutputSchema>;
