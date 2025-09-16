import { GoogleGenerativeAI } from "@google/generative-ai";

import { redactPII } from "../util/redact";
import { sha256Base64 } from "../util/hash";
import { sleep } from "../util/sleep";
import { buildModerationPrompt } from "./prompt";
import { tryParseModelTextToJson } from "./json";
import type { LlmJson } from "../types/schemas";
import dotenv from "dotenv";

dotenv.config()

/** Simple in-memory TTL cache */
interface CacheEntry {
  value: LlmJson;
  expiresAt: number;
}
const CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface GeminiOptions {
  apiKey?: string;           // defaults to process.env.GEMINI_API_KEY
  model?: string;            // defaults to process.env.GEMINI_MODEL || "gemini-2.0-flash"
  ttlMs?: number;            // cache TTL
  maxRetries?: number;       // default 2
  initialBackoffMs?: number; // default 300
  abortSignal?: AbortSignal;
  // future: safety settings, system instruction, etc.
}

export class GeminiModeration {
  private apiKey: string;
  private modelName: string;
  private ttl: number;
  private maxRetries: number;
  private initialBackoffMs: number;

  constructor(opts: GeminiOptions = {}) {
    const key = opts.apiKey ?? process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is required");
    this.apiKey = key;

    this.modelName = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
    this.ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.maxRetries = opts.maxRetries ?? 2;
    this.initialBackoffMs = opts.initialBackoffMs ?? 300;
  }

  /** Main entry: classify a text and return validated LLM JSON. */
  async classify(text: string, _lang?: string, abortSignal?: AbortSignal): Promise<LlmJson> {
    const { redacted } = redactPII(text);
    const cacheKey = this.cacheKey(redacted);

    const cached = this.fromCache(cacheKey);
    if (cached) return cached;

    const prompt = buildModerationPrompt(redacted);

    const genAI = new GoogleGenerativeAI(this.apiKey);
    const model = genAI.getGenerativeModel({ model: this.modelName });

    const generationConfig = {
      // Strongly hint JSON-only
      responseMimeType: "application/json",
      // Keep outputs concise
      maxOutputTokens: 256,
      temperature: 0,
    } as any;

    let attempt = 0;
    let backoff = this.initialBackoffMs;

    // basic retry on transient errors or parse failures
    while (true) {
      attempt++;
      try {
        const result = await model.generateContent(
          { contents: [{ role: "user", parts: [{ text: prompt }] }] } as any,
          { signal: abortSignal } as any,
        );
        const textOut = result.response.text();
        const parsed = tryParseModelTextToJson(textOut);

        if (parsed) {
          this.toCache(cacheKey, parsed);
          return parsed;
        }

        if (attempt > this.maxRetries) {
          // Fail-safe object → lets policy treat as review
          const fallback: LlmJson = {
            scores: {
              hate: 0, harassment: 0, self_harm: 0, sexual: 0, sexual_minors: 0,
              violence: 0, extremism: 0, politics: 0, spam: 0, scam: 0, csam_signal: 0,
            },
            labels: [],
            evidence: ["parser_error_or_nonjson_output"],
            uncertainty: 0.75,
          };
          this.toCache(cacheKey, fallback);
          return fallback;
        }
      } catch (err) {
        if (attempt > this.maxRetries) {
          const fallback: LlmJson = {
            scores: {
              hate: 0, harassment: 0, self_harm: 0, sexual: 0, sexual_minors: 0,
              violence: 0, extremism: 0, politics: 0, spam: 0, scam: 0, csam_signal: 0,
            },
            labels: [],
            evidence: ["gemini_error:" + (err as Error).message.slice(0, 120)],
            uncertainty: 0.85,
          };
          this.toCache(cacheKey, fallback);
          return fallback;
        }
      }

      await sleep(backoff);
      backoff = Math.min(backoff * 2, 2500);
    }
  }

  // --- cache helpers ---

  private cacheKey(redacted: string): string {
    return `${this.modelName}:${sha256Base64(redacted)}`;
  }

  private fromCache(key: string): LlmJson | null {
    const hit = CACHE.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      CACHE.delete(key);
      return null;
    }
    return hit.value;
  }

  private toCache(key: string, value: LlmJson) {
    CACHE.set(key, { value, expiresAt: Date.now() + this.ttl });
  }
}
