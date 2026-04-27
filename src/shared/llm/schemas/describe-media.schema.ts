/**
 * Schema 2 niveaux pour describe_media :
 *  - short_caption ≤ 80c (légende ultra-courte, indexable)
 *  - detailed_description ≤ ~180 mots
 *  - structured_observations : observations rattachables à des sections
 *  - ocr_text : texte OCR brut si plaque/étiquette/plan détecté
 */
import { z } from "zod";

export const DescribeMediaOutputSchema = z.object({
  short_caption: z.string().min(1).max(160),
  detailed_description: z.string().max(2000).nullable(),
  structured_observations: z
    .array(
      z.object({
        section_hint: z.string().min(1).max(80),
        observation: z.string().min(1).max(400),
      }),
    )
    .max(20)
    .default([]),
  ocr_text: z.string().max(4000).nullable(),
  confidence_overall: z.number().min(0).max(1),
  warnings: z.array(z.string().max(200)).max(20).default([]),
});

export type DescribeMediaOutput = z.infer<typeof DescribeMediaOutputSchema>;
