/**
 * Schema de sortie de conversational_query (réponse libre + sources).
 */
import { z } from "zod";

export const ConversationalOutputSchema = z.object({
  answer_markdown: z.string().min(1).max(4000),
  evidence_refs: z.array(z.string()).max(20).default([]),
  confidence_overall: z.number().min(0).max(1),
  warnings: z.array(z.string().max(200)).max(20).default([]),
});

export type ConversationalOutput = z.infer<typeof ConversationalOutputSchema>;
