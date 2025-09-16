import { CATEGORIES, type Category } from "../types/categories";

export interface CategoryThreshold {
  /**
   * Inclusive lower bound, exclusive upper bound for "review".
   * Any score in [review[0], review[1]) maps to review.
   */
  review: [number, number];
  /**
   * Inclusive lower bound for "block".
   * Any score >= block maps to block.
   */
  block: number;
}

export type Thresholds = Record<Category, CategoryThreshold>;

const DEFAULT_BLOCK = 0.85;
const DEFAULT_REVIEW_LOW = 0.7;

const makeDefault = (overrides?: Partial<CategoryThreshold>): CategoryThreshold => ({
  review: [DEFAULT_REVIEW_LOW, DEFAULT_BLOCK],
  block: DEFAULT_BLOCK,
  ...overrides,
});

/**
 * Default thresholds (conservative for sensitive categories).
 * You can tune these later or externalize to config.
 */
export const DEFAULT_THRESHOLDS: Thresholds = Object.fromEntries(
  CATEGORIES.map((c) => {
    switch (c) {
      case "sexual_minors":
      case "csam_signal":
        return [c, makeDefault({ review: [0.4, 0.6], block: 0.6 })];
      case "extremism":
        return [c, makeDefault({ review: [0.65, 0.8], block: 0.8 })];
      default:
        return [c, makeDefault()];
    }
  }),
) as Thresholds;

/**
 * When model uncertainty is high, we "widen" the review band upwards to fail-safe.
 * For simplicity we shift the block threshold and the review upper bound up by delta,
 * capped at 1.0.
 */
export const UNCERTAINTY_REVIEW_WIDEN_DELTA = 0.05;

/** Thresholds adjusted for uncertainty (pure function). */
export function withUncertaintyAdjusted(
  thresholds: Thresholds,
  uncertainty: number,
  widenDelta = UNCERTAINTY_REVIEW_WIDEN_DELTA,
): Thresholds {
  if (uncertainty < 0.5) return thresholds;

  const widen = Math.min(1, widenDelta);
  const adjusted = {} as Thresholds;

  for (const [cat, thr] of Object.entries(thresholds) as [Category, CategoryThreshold][]) {
    const reviewLow = thr.review[0];
    const reviewHigh = Math.min(1, thr.review[1] + widen);
    const block = Math.min(1, thr.block + widen);
    adjusted[cat] = { review: [reviewLow, reviewHigh], block };
  }

  return adjusted;
}
