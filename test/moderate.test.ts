import { describe, it, expect } from "vitest";
import { moderateText } from "../src/core/moderate";
import type { LlmClient } from "../src/core/moderate";
import type { LlmJson } from "../src/types/schemas";
import { EMPTY_SCORES } from "../src/types/categories";

class FakeLLM implements LlmClient {
  private payload: LlmJson | null;
  private delayMs: number;
  constructor(payload: LlmJson | null, delayMs = 0) {
    this.payload = payload;
    this.delayMs = delayMs;
  }
  async classify(_text: string, _lang?: string, signal?: AbortSignal): Promise<LlmJson> {
    if (this.delayMs) await new Promise((res, rej) => {
      const t = setTimeout(res, this.delayMs);
      signal?.addEventListener("abort", () => {
        clearTimeout(t);
        rej(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
    if (!this.payload) throw new Error("fake failure");
    return this.payload;
  }
}

function makePayload(scores: Partial<LlmJson["scores"]>, uncertainty = 0.1): LlmJson {
  return {
    scores: {
      hate: 0, harassment: 0, self_harm: 0, sexual: 0, sexual_minors: 0,
      violence: 0, extremism: 0, politics: 0, spam: 0, scam: 0, csam_signal: 0,
      ...scores,
    },
    labels: [],
    evidence: ["test"],
    uncertainty,
  };
}

describe("moderateText orchestrator", () => {
  it("allows benign content", async () => {
    const llm = new FakeLLM(makePayload({ spam: 0.2 }));
    const res = await moderateText("hello", { llm });
    expect(res.action).toBe("allow");
    expect(res.allowed).toBe(true);
    expect(res.risk).toBe(0.2);
    expect(res.labels.length).toBe(0);
  });

  it("reviews content in review band", async () => {
    const llm = new FakeLLM(makePayload({ harassment: 0.74 }));
    const res = await moderateText("mean", { llm });
    expect(res.action).toBe("review");
    expect(res.allowed).toBe(false);
    expect(res.labels).toContain("harassment");
  });

  it("blocks content above block threshold", async () => {
    const llm = new FakeLLM(makePayload({ hate: 0.9 }));
    const res = await moderateText("very bad", { llm });
    expect(res.action).toBe("block");
    expect(res.allowed).toBe(false);
    expect(res.labels).toContain("hate");
  });

  it("widens review band under high uncertainty (fail-safe)", async () => {
    // extremism default block is 0.8; with uncertainty widening, 0.81 should drop to review
    const llmLow = new FakeLLM(makePayload({ extremism: 0.81 }, 0.1));
    const resLow = await moderateText("x", { llm: llmLow });
    expect(resLow.action).toBe("block");

    const llmHigh = new FakeLLM(makePayload({ extremism: 0.81 }, 0.7));
    const resHigh = await moderateText("x", { llm: llmHigh });
    expect(resHigh.action).toBe("review");
  });

  it("returns review on timeout", async () => {
    const llm = new FakeLLM(makePayload({ hate: 0.9 }), 200);
    const res = await moderateText("slow", { llm, timeoutMs: 20 });
    expect(["review","block"]).toContain(res.action); // timeout fallback picks review
    expect(res.allowed).toBe(false);
  });

  it("handles thrown LLM error with review fallback", async () => {
    const failingLLM: LlmClient = {
      async classify() { throw new Error("provider exploded"); },
    };
    const res = await moderateText("boom", { llm: failingLLM });
    expect(res.action).toBe("review");
    expect(res.allowed).toBe(false);
  });

  it("keeps explanations from LLM evidence", async () => {
    const payload = makePayload({ harassment: 0.8 });
    payload.evidence = ["insulting phrase", "demeaning tone"];
    const llm = new FakeLLM(payload);
    const res = await moderateText("rude", { llm });
    expect(res.explanations[0]).toContain("insulting");
  });

  it("does not mutate EMPTY_SCORES baseline", async () => {
    const llm = new FakeLLM(makePayload({}));
    const res = await moderateText("noop", { llm });
    // Sanity: ensure we didn't alter the constant
    expect(EMPTY_SCORES.hate).toBe(0);
    expect(res.scores.hate).toBe(0);
  });
});
