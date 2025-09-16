/**
 * Minimal PII redaction utilities.
 * Replaces matches with stable tokens. Returns redacted text and a reversible map (not persisted).
 */

export type RedactionMap = Array<{ token: string; value: string }>;

export interface RedactResult {
  redacted: string;
  map: RedactionMap;
}

const patterns = [
  { name: "EMAIL", re: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  // Rough, international-ish phone matcher; keeps it conservative to avoid over-redaction.
  { name: "PHONE", re: /\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,4}[\s.-]?\d{4}\b/g },
  { name: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g }, // US SSN
  // Naive street address (number + street + type). Good enough for demo.
  {
    name: "ADDRESS",
    re: /\b\d{1,5}\s+(?:[A-Za-z0-9]+\s){1,4}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr)\b\.?/gi,
  },
  // Credit card (very rough)
  { name: "CARD", re: /\b(?:\d[ -]*?){13,16}\b/g },
];

export function redactPII(input: string): RedactResult {
  let redacted = input;
  const map: RedactionMap = [];

  for (const { name, re } of patterns) {
    redacted = redacted.replace(re, (m) => {
      const token = `[${name}]`;
      map.push({ token, value: m });
      return token;
    });
  }

  return { redacted, map };
}
