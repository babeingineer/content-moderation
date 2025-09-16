export const CATEGORIES = [
  "hate",
  "harassment",
  "self_harm",
  "sexual",
  "sexual_minors",
  "violence",
  "extremism",
  "politics",
  "spam",
  "scam",
  "csam_signal",
] as const;

export type Category = (typeof CATEGORIES)[number];

export type CategoryScores = Record<Category, number>;

export const EMPTY_SCORES: CategoryScores = Object.fromEntries(
  CATEGORIES.map((c) => [c, 0]),
) as CategoryScores;
