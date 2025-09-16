import "dotenv/config";
import { Command } from "commander";
import fs from "node:fs";
import readline from "node:readline";
import { once } from "node:events";

import { moderateText } from "../core/moderate";
import type { ModerationResult } from "../types/common";

const program = new Command();

program
  .name("moderate")
  .description("LLM-only content moderation (Gemini)")
  .argument("[text...]", "text to moderate (omit when using --file)")
  .option("-f, --file <jsonl>", "JSONL file with {\"text\":\"...\",\"lang?\":\"en\"} per line")
  .option("--lang <code>", "language hint (IETF tag, e.g., en, es)")
  .option("--json", "print raw JSON result(s)", false)
  .option("--timeout <ms>", "LLM timeout per item (ms)", (v) => parseInt(v, 10), 3500)
  .parse(process.argv);

type CliOpts = {
  file?: string;
  lang?: string;
  json?: boolean;
  timeout?: number;
};

function exitCodeFor(action: ModerationResult["action"]): number {
  switch (action) {
    case "allow": return 0;
    case "review": return 2;
    case "block": return 3;
  }
}

function printResult(res: ModerationResult, jsonMode: boolean) {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(res) + "\n");
    return;
  }
  const lines = [
    `action: ${res.action.toUpperCase()}`,
    `risk: ${res.risk.toFixed(2)}`,
    `labels: ${res.labels.join(", ") || "-"}`,
    `uncertainty: ${res.uncertainty.toFixed(2)}`,
  ];
  if (res.explanations.length) {
    lines.push(`explanations: ${res.explanations.join(" | ")}`);
  }
  process.stdout.write(lines.join("\n") + "\n");
}

async function handleSingle(text: string, opts: CliOpts) {
  try {
    const res = await moderateText(text, { lang: opts.lang, timeoutMs: opts.timeout });
    printResult(res, !!opts.json);
    process.exit(exitCodeFor(res.action));
  } catch (err) {
    console.error(`[error] ${String((err as Error).message || err)}`);
    process.exit(1);
  }
}

async function handleBatch(file: string, opts: CliOpts) {
  if (!fs.existsSync(file)) {
    console.error(`[error] file not found: ${file}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let worstExit = 0; // 0 allow, 2 review, 3 block
  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let obj: { text: string; lang?: string };
    try {
      obj = JSON.parse(trimmed);
      if (typeof obj.text !== "string" || obj.text.length === 0) {
        throw new Error("missing text");
      }
    } catch (e) {
      console.error(`[warn] skipping invalid JSONL line: ${trimmed.slice(0, 120)}`);
      return;
    }
    try {
      const res = await moderateText(obj.text, {
        lang: obj.lang ?? opts.lang,
        timeoutMs: opts.timeout,
      });
      printResult(res, !!opts.json);
      const code = exitCodeFor(res.action);
      worstExit = Math.max(worstExit, code);
    } catch (err) {
      console.error(`[error] ${String((err as Error).message || err)}`);
      // treat errors as review (fail-safe)
      worstExit = Math.max(worstExit, 2);
    }
  });

  await once(rl, "close");
  process.exit(worstExit);
}

(async () => {
  const opts = program.opts<CliOpts>();
  const textParts = program.args as string[];
  const inline = textParts.length ? textParts.join(" ") : "";

  if (opts.file && inline) {
    console.error("[error] Provide either TEXT args or --file, not both.");
    process.exit(1);
  }
  if (!opts.file && !inline) {
    program.help({ error: true });
  }

  if (opts.file) {
    await handleBatch(opts.file, opts);
  } else {
    await handleSingle(inline, opts);
  }
})();
