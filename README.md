# Content Moderation (TypeScript)

Single-stage moderation using **Gemini**.  
No rules, no local models, no rate limiting. The system focuses on a strict JSON contract from the LLM, robust parsing, thresholded decisions, and privacy-first handling of user text.

> Requires Node ≥ 20 and an environment variable `GEMINI_API_KEY`. Default model: `gemini-2.0-flash`.

---

## Overview

Pipeline:
1. **Redact PII** (emails, phones, SSNs, common address patterns) locally.
2. **Call Gemini** with a strict “JSON-only” prompt.
3. **Parse & validate** the JSON.
4. **Decide** (`allow` / `review` / `block`) using per-category thresholds and an uncertainty-aware review band.
5. **Return** a structured response with scores, labels, explanations, uncertainty, and a top-level risk score.

Simple ASCII sketch:
```

[text] -> [PII redactor] -> [Gemini] -> [JSON parser/validator] -> [decision] -> [result JSON]

````

---

## Categories (scored 0–1)

`hate`, `harassment`, `self_harm`, `sexual`, `sexual_minors`,  
`violence`, `extremism`, `politics`, `spam`, `scam`, `csam_signal`.

> You can adjust the list and thresholds in code.

---

## Output schema (response example)

```json
{
  "action": "block",
  "allowed": false,
  "risk": 0.92,
  "labels": ["hate", "harassment"],
  "scores": {
    "hate": 0.94,
    "harassment": 0.83,
    "self_harm": 0.05,
    "sexual": 0.02,
    "sexual_minors": 0.00,
    "violence": 0.11,
    "extremism": 0.07,
    "politics": 0.10,
    "spam": 0.12,
    "scam": 0.08,
    "csam_signal": 0.00
  },
  "uncertainty": 0.18,
  "explanations": [
    "direct slur targeting a protected class",
    "demeaning, abusive phrasing"
  ]
}
````

* **risk**: aggregate severity (e.g., `max(scores)` or a weighted aggregate).
* **labels**: categories that crossed their decision thresholds.
* **uncertainty**: 0–1 self-estimate from the model; can widen the review band.

---

## Decision policy (thresholds)

Default policy (tune as needed):

* **Block** if any category ≥ **0.85**
* **Review** if any category ∈ **\[0.70, 0.85)**
* **Allow** otherwise

Sensitive categories (more conservative):

| Category       | Block ≥ | Review band |
| -------------- | ------- | ----------- |
| sexual\_minors | 0.60    | 0.40–0.60   |
| csam\_signal   | 0.60    | 0.40–0.60   |
| extremism      | 0.80    | 0.65–0.80   |

Uncertainty handling:

* If `uncertainty ≥ 0.50`, widen the review band upward by +0.05 (fail-safe).
* If parsing/validation fails, default to `action = "review"`.

---

## HTTP API

**Endpoint**: `POST /moderate`
**Request body**

```json
{ "text": "string", "lang": "optional IETF tag, e.g. 'en'" }
```

**Success (200)**

```json
{
  "action": "allow|review|block",
  "allowed": true,
  "risk": 0.00,
  "labels": [],
  "scores": { "hate":0, "harassment":0, "...":0 },
  "uncertainty": 0.00,
  "explanations": []
}
```

**Errors**

* `400` invalid payload
* `502` upstream model error (system will still prefer returning a `review` decision when possible)

---

## CLI

Two modes:

**Single text (cmd.exe)**

```cmd
npm run cli -- "I hate you"
```

**Batch JSONL (cmd.exe)**

```cmd
:: each line: {"text":"...","lang":"en"}
npm run cli -- --file data\fixtures\dev.jsonl --json
```

Exit codes: `0 = allow`, `2 = review`, `3 = block`.

---

## Gemini prompt contract (strict JSON)

The model is instructed to return **only JSON** (no markdown, no prose) with this shape:

```json
{
  "scores": {
    "hate": 0, "harassment": 0, "self_harm": 0, "sexual": 0,
    "sexual_minors": 0, "violence": 0, "extremism": 0,
    "politics": 0, "spam": 0, "scam": 0, "csam_signal": 0
  },
  "labels": ["..."],
  "evidence": ["short, non-PII reasons (≤3)"],
  "uncertainty": 0
}
```

Parsing strategy:

* Extract the first `{…}` block and `JSON.parse`.
* Validate shape and number ranges.
* On failure, mark as `review`.

---

## PII redaction & privacy

* **Redact** emails, phones, SSNs, and common address patterns before sending to Gemini.
* Replace with stable tokens (`[EMAIL]`, `[PHONE]`, etc.).
* Avoid logging raw text; prefer hashed content IDs.
* Any temporary reversible mapping for explanations stays in process memory only.

---

## Configuration

Environment variables (see `.env.example`):

* `GEMINI_API_KEY` — required
* `GEMINI_MODEL` — optional, default `gemini-2.0-flash`
