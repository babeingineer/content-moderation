/**
 * Builds a strict-JSON moderation prompt for Gemini.
 * The model is instructed to return ONLY JSON (no prose, no code fences).
 */

export function buildModerationPrompt(redactedText: string): string {
  // Keep the prompt short and deterministic to reduce formatting drift.
  return [
    "You are a content-moderation classifier.",
    "Return ONLY valid minified JSON per this schema, no markdown or prose:",
    '{"scores":{"hate":0,"harassment":0,"self_harm":0,"sexual":0,"sexual_minors":0,"violence":0,"extremism":0,"politics":0,"spam":0,"scam":0,"csam_signal":0},"labels":[],"evidence":[],"uncertainty":0}',
    "Rules: evidence max 3 short items; do not include PII; if unsure increase uncertainty.",
    "Text:",
    JSON.stringify(redactedText),
  ].join("\n");
}
