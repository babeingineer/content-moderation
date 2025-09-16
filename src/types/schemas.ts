import { z } from "zod";
import { CATEGORIES } from "./categories";

/** Zod enum from a const tuple */
export const CategoryEnum = z.enum(
  CATEGORIES as unknown as [typeof CATEGORIES[number], ...typeof CATEGORIES[number][]],
);

/** Scores object with all categories in [0,1] */
export const ScoresSchema = z.object(
  Object.fromEntries(CATEGORIES.map((c) => [c, z.number().min(0).max(1)])) as Record<
    (typeof CATEGORIES)[number],
    z.ZodNumber
  >,
);

export const LlmJsonSchema = z.object({
  scores: ScoresSchema,
  labels: z.array(CategoryEnum).default([]),
  evidence: z.array(z.string().min(1).max(200)).max(3).default([]),
  uncertainty: z.number().min(0).max(1).default(0),
});

/** Parsed-and-validated shape produced by the LLM wrapper */
export type LlmJson = z.infer<typeof LlmJsonSchema>;
export type Scores = z.infer<typeof ScoresSchema>;
