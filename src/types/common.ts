import type { Category, CategoryScores } from "./categories";

export type Action = "allow" | "review" | "block";

/**
 * Final, user-facing moderation result (what API/CLI will return).
 */
export interface ModerationResult {
  action: Action;
  allowed: boolean;
  risk: number; // aggregate severity (e.g., max score)
  labels: Category[]; // categories at/above review band minimum
  scores: CategoryScores;
  uncertainty: number; // 0..1 (from LLM)
  explanations: string[]; // short, non-PII reasons (can be empty here)
}
