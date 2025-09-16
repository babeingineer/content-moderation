import { z } from "zod";
import { LlmJsonSchema, type LlmJson } from "../types/schemas";

/**
 * Extract the first top-level JSON object from a string.
 * Tolerant to extra text before/after; handles braces inside strings.
 */
export function extractFirstJsonObject(source: string): string | null {
  let i = source.indexOf("{");
  if (i < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let idx = i; idx < source.length; idx++) {
    const ch = source[idx];

    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === "\\") {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }

    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return source.slice(i, idx + 1);
      }
    }
  }
  return null;
}

/** Parse and validate the LLM JSON, returning a safe object or throwing. */
export function parseLlmJson(input: string): LlmJson {
  const obj = JSON.parse(input);
  const parsed = LlmJsonSchema.parse(obj);
  // Ensure number ranges [0,1]
  for (const [k, v] of Object.entries(parsed.scores)) {
    if (typeof v !== "number" || v < 0 || v > 1) {
      throw new Error(`score out of range for ${k}`);
    }
  }
  if (parsed.uncertainty < 0 || parsed.uncertainty > 1) {
    throw new Error("uncertainty out of range");
  }
  return parsed;
}

/** Safe parse pipeline from raw model text → validated LlmJson (or null on failure). */
export function tryParseModelTextToJson(text: string): LlmJson | null {
  const jsonStr = extractFirstJsonObject(text);
  if (!jsonStr) return null;
  try {
    return parseLlmJson(jsonStr);
  } catch {
    return null;
  }
}
