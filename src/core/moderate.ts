import { GeminiModeration, type GeminiOptions } from "../llm/gemini";
import type { LlmJson } from "../types/schemas";
import { type Thresholds, DEFAULT_THRESHOLDS } from "./thresholds";
import { applyPolicy } from "./decision";
import { CATEGORIES, type CategoryScores } from "../types/categories";
import type { ModerationResult } from "../types/common";

/** Small interface to enable DI/mocking in tests */
export interface LlmClient {
  classify(text: string, lang?: string, abortSignal?: AbortSignal): Promise<LlmJson>;
}

export interface ModerateOptions {
  llm?: LlmClient;              // override LLM client
  gemini?: GeminiOptions;       // options if we construct GeminiModeration
  timeoutMs?: number;           // overall LLM timeout
  thresholds?: Thresholds;      // decision thresholds
  lang?: string;                // optional language hint
}

function toCategoryScores(scores: LlmJson["scores"]): CategoryScores {
  const obj: Partial<CategoryScores> = {};
  for (const c of CATEGORIES) obj[c] = scores[c];
  return obj as CategoryScores;
}

/** Conservative fallback object used on timeout/error */
function fallbackLlmJson(reason: string): LlmJson {
  return {
    scores: {
      hate: 0, harassment: 0, self_harm: 0, sexual: 0, sexual_minors: 0,
      violence: 0, extremism: 0, politics: 0, spam: 0, scam: 0, csam_signal: 0,
    },
    labels: [],
    evidence: [`fallback:${reason}`],
    uncertainty: 0.85, // high uncertainty → widen review band
  };
}

/**
 * Orchestrates: LLM (Gemini) → parse → thresholds/policy → ModerationResult
 */
export async function moderateText(
  text: string,
  opts: ModerateOptions = {},
): Promise<ModerationResult> {
  const thresholds = opts.thresholds ?? DEFAULT_THRESHOLDS;

  // choose / construct LLM client
  const llm: LlmClient = opts.llm ?? new GeminiModeration(opts.gemini);

  // apply timeout if provided
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  let timer: NodeJS.Timeout | undefined;
  if (controller && opts.timeoutMs && opts.timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  }

  let llmJson: LlmJson;
  let usedFallback = false;
  let fallbackReason: string | null = null;

  try {
    llmJson = await llm.classify(text, opts.lang, controller?.signal);
  } catch (err) {
    usedFallback = true;
    fallbackReason =
      (err as Error)?.name === "AbortError" ? "timeout" : `llm_error:${(err as Error).message?.slice(0, 120)}`;
    llmJson = fallbackLlmJson(fallbackReason);
  } finally {
    if (timer) clearTimeout(timer);
  }

  // Map LLM output to our policy/result
  const scores = toCategoryScores(llmJson.scores);
  let result = applyPolicy({
    scores,
    uncertainty: llmJson.uncertainty,
    explanations: (llmJson.evidence ?? []).slice(0, 3),
    thresholds,
  });

  // Fail-safe: if we used a fallback (timeout/error) and policy would "allow", override to "review".
  if (usedFallback && result.action === "allow") {
    result = {
      ...result,
      action: "review",
      allowed: false,
      explanations:
        result.explanations.length > 0
          ? result.explanations
          : [fallbackReason ?? "fallback"],
    };
  }

  return result;
}
