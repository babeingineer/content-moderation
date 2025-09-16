import { type Category, CATEGORIES, type CategoryScores } from "../types/categories";
import { type Thresholds, DEFAULT_THRESHOLDS, withUncertaintyAdjusted } from "./thresholds";
import type { ModerationResult, Action } from "../types/common";

/** Aggregate risk = max score (simple, monotonic). */
export function computeRisk(scores: CategoryScores): number {
  return Math.max(...CATEGORIES.map((c) => scores[c]));
}

/** Pick labels as categories that at least reach the review band. */
export function deriveLabels(scores: CategoryScores, thresholds: Thresholds): Category[] {
  const labels: Category[] = [];
  for (const c of CATEGORIES) {
    const { review, block } = thresholds[c];
    const s = scores[c];
    if (s >= review[0]) {
      // (we include both review- and block-range categories)
      labels.push(c);
    } else if (s >= block) {
      labels.push(c);
    }
  }
  return labels;
}

/** Decide the action per the thresholds (block beats review beats allow). */
export function decideAction(scores: CategoryScores, thresholds: Thresholds): Action {
  let anyReview = false;

  for (const c of CATEGORIES) {
    const s = scores[c];
    const thr = thresholds[c];

    if (s >= thr.block) return "block";
    if (s >= thr.review[0] && s < thr.review[1]) anyReview = true;
  }

  return anyReview ? "review" : "allow";
}

/**
 * Main policy function. Given scores (+uncertainty), compute a ModerationResult skeleton.
 * Explanations are left empty here and should be filled from the LLM "evidence" when available.
 */
export function applyPolicy(params: {
  scores: CategoryScores;
  uncertainty?: number;
  explanations?: string[];
  thresholds?: Thresholds;
}): ModerationResult {
  const { scores } = params;
  const uncertainty = params.uncertainty ?? 0;
  const base = params.thresholds ?? DEFAULT_THRESHOLDS;
  const thr = withUncertaintyAdjusted(base, uncertainty);

  const action = decideAction(scores, thr);
  const labels = deriveLabels(scores, thr);
  const risk = computeRisk(scores);

  return {
    action,
    allowed: action === "allow",
    risk,
    labels,
    scores,
    uncertainty,
    explanations: params.explanations ?? [],
  };
}
