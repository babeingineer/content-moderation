import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import { z } from "zod";

import { moderateText } from "../core/moderate";

const app = express();
app.use(express.json({ limit: "512kb" }));

// ---- Schemas ----
const BodySchema = z.object({
  text: z.string().min(1, "text is required"),
  lang: z.string().min(2).max(10).optional(),
});

// ---- Routes ----
app.get("/live", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.post("/moderate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "invalid_request",
        details: parsed.error.flatten(),
      });
    }

    const { text, lang } = parsed.data;

    // Optional timeout to prevent hanging requests; adjust as desired
    const result = await moderateText(text, {
      lang,
      timeoutMs: 3500,
      // thresholds can be overridden here if needed
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// ---- Error handler (minimal, no raw text logging) ----
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err?.statusCode ?? 502;
  res.status(status).json({
    error: "moderation_failed",
    message: err?.message ?? "Upstream error",
  });
});

// ---- Start server ----
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[api] listening on http://localhost:${PORT}`);
});
