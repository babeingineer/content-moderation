import { describe, it, expect } from "vitest";
import { EMPTY_SCORES } from "../src/types/categories";
import { DEFAULT_THRESHOLDS, withUncertaintyAdjusted } from "../src/core/thresholds";
import { applyPolicy } from "../src/core/decision";

describe("decision policy", () => {
  it("allows benign content", () => {
    const scores = { ...EMPTY_SCORES, spam: 0.1, politics: 0.2 };
    const res = applyPolicy({ scores, uncertainty: 0.1 });
    expect(res.action).toBe("allow");
    expect(res.allowed).toBe(true);
    expect(res.risk).toBeCloseTo(0.2);
    expect(res.labels.length).toBe(0);
  });

  it("reviews content in the review band", () => {
    const scores = { ...EMPTY_SCORES, harassment: 0.75 };
    const res = applyPolicy({ scores });
    expect(res.action).toBe("review");
    expect(res.allowed).toBe(false);
    expect(res.labels).toContain("harassment");
  });

  it("blocks content above block threshold", () => {
    const scores = { ...EMPTY_SCORES, hate: 0.9 };
    const res = applyPolicy({ scores });
    expect(res.action).toBe("block");
    expect(res.allowed).toBe(false);
    expect(res.labels).toContain("hate");
  });

  it("widens review band under high uncertainty", () => {
    const scores = { ...EMPTY_SCORES, extremism: 0.81 }; // default block=0.8
    const resLowU = applyPolicy({ scores, uncertainty: 0.1 });
    const resHighU = applyPolicy({ scores, uncertainty: 0.7 });

    // With low uncertainty, this blocks.
    expect(resLowU.action).toBe("block");
    // With high uncertainty, block threshold rises, so this becomes review.
    expect(resHighU.action).toBe("review");
  });
});
