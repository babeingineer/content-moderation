import { describe, it, expect } from "vitest";
import { extractFirstJsonObject, tryParseModelTextToJson } from "../src/llm/json";

describe("LLM JSON extraction", () => {
  it("extracts first JSON object in the presence of prose", () => {
    const s = 'blah {"a":1,"b":{"c":"} inside"}} trailing';
    const j = extractFirstJsonObject(s);
    expect(j).toBe('{"a":1,"b":{"c":"} inside"}}');
  });

  it("returns null if no JSON object", () => {
    expect(extractFirstJsonObject("no braces here")).toBeNull();
  });

  it("validates schema when possible", () => {
    const text =
      'ok {"scores":{"hate":0,"harassment":0.1,"self_harm":0,"sexual":0,"sexual_minors":0,"violence":0,"extremism":0,"politics":0,"spam":0,"scam":0,"csam_signal":0},"labels":[],"evidence":[],"uncertainty":0.2} thanks';
    const parsed = tryParseModelTextToJson(text);
    expect(parsed?.scores.harassment).toBeCloseTo(0.1);
    expect(parsed?.uncertainty).toBeCloseTo(0.2);
  });
});
