/**
 * Builds a strict-JSON moderation prompt for Gemini.
 * The model is instructed to return ONLY JSON (no prose, no code fences).
 */

export function buildModerationPrompt(redactedText: string): string {
  // Strict JSON contract expected by the parser/schema in this repo
  const SCHEMA =
    '{"scores":{"hate":0,"harassment":0,"self_harm":0,"sexual":0,"sexual_minors":0,"violence":0,"extremism":0,"politics":0,"spam":0,"scam":0,"csam_signal":0},"labels":[],"evidence":[],"uncertainty":0}';

  return [
    "SYSTEM: You are a content-moderation classifier. Output ONLY one minified JSON object matching the schema below.",
    `SCHEMA:${SCHEMA}`,
    "HARD RULES: 1) No markdown, no code fences, no extra text. 2) All numbers in [0,1] (prefer two decimals). 3) evidence ≤3 short items; paraphrase; NEVER include PII. 4) If ambiguous/quoted/satire, raise uncertainty rather than guessing.",
    "CATEGORIES:",
    "- hate: insults/threats targeting protected classes or attributes.",
    "- harassment: abusive/insulting language toward a person/group (non-protected).",
    "- self_harm: admissions, instructions, or intent related to self-harm/suicide/eating disorders.",
    "- sexual: sexual content involving consenting adults; erotic/explicit requests.",
    "- sexual_minors: ANY sexualized mention involving minors (e.g., 'underage', '14yo', 'schoolgirl'); solicitations; depictions. Always higher than 'sexual' when minors implied.",
    "- violence: threats, praise, or instructions to physically harm.",
    "- extremism: support/praise/propaganda for extremist/terrorist orgs/ideologies.",
    "- politics: political actors, elections, public policy, persuasion/advocacy.",
    "- spam: mass marketing, engagement bait, repetitive promos.",
    "- scam: fraud/phishing/impersonation/crypto-giveaway; requests for money/credentials.",
    "- csam_signal: trading/soliciting child sexual abuse material (e.g., 'cp','pthc'); requesting/sharing nudes from minors. If unsure but suggestive → high uncertainty.",
    "SCORING GUIDE: 0.00 none • 0.10 weak cue • 0.30 suggestive • 0.50 ambiguous/partial • 0.70 clear presence • 0.85 egregious/explicit • 1.00 illegal/explicit advocacy.",
    "EDGE CASES: Quoted/reporting harmful text → lower score + higher uncertainty. Satire/irony → score by likely effect. Reclaimed slurs (in-group) → moderate score w/ uncertainty. Adult-only sexual content → 'sexual' but NOT 'sexual_minors'.",
    "OUTPUT: Fill the schema. Include category names in labels when their score is meaningfully present (≈≥0.70 or stricter where applicable). Do not add keys.",
    "TEXT:",
    JSON.stringify(redactedText),
  ].join("\n");
}
