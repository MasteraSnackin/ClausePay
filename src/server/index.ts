import "dotenv/config";
import express from "express";
import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { z } from "zod";
import type { DemoPayload, RunCampaignRequest } from "../shared/types";
import { demoContract, demoInvoice, getDefaultPublicContextTarget } from "./data/demoData";
import { getEnvStatus } from "./env";
import { runRecoveryCampaign } from "./agent/runRecoveryAgent";
import { getClickHouseLedgerStats } from "./integrations/clickhouse";
import { listCampaigns, readCampaign } from "./storage/localStore";
import { NotFoundError, ValidationError, toErrorResponse } from "./errors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const app = express();
const port = Number(process.env.PORT || 5173);

app.use((_req, res, next) => {
  res.locals.requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
  res.setHeader("X-Request-Id", res.locals.requestId);
  next();
});

app.use(express.json({ limit: "1mb" }));

const optionalTrimmedString = (maxLength: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(maxLength).optional()
  );

const runCampaignSchema = z
  .object({
    researchCompanyName: optionalTrimmedString(120),
    researchDomain: z.preprocess(
      (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
      z
        .string()
        .trim()
        .min(1)
        .max(253)
        .regex(/^(https?:\/\/)?[a-z0-9.-]+(:[0-9]+)?(\/.*)?$/i, "Enter a domain or URL, not arbitrary text.")
        .optional()
    )
  })
  .strict();

app.get("/api/demo", (_req, res) => {
  const payload: DemoPayload = {
    invoice: demoInvoice,
    contract: demoContract,
    publicContextTarget: getDefaultPublicContextTarget(),
    envStatus: getEnvStatus()
  };

  res.json(payload);
});

app.get("/api/readiness", async (_req, res, next) => {
  try {
    res.json({
      envStatus: getEnvStatus(),
      clickhouse: await getClickHouseLedgerStats()
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/recovery/run", async (req, res, next) => {
  try {
    const parsed = runCampaignSchema.safeParse(req.body || {});
    if (!parsed.success) {
      throw new ValidationError("The campaign request is invalid.", {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message
        }))
      });
    }
    const body = parsed.data as RunCampaignRequest;
    const campaign = await runRecoveryCampaign(body);
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns", async (_req, res, next) => {
  try {
    res.json(await listCampaigns());
  } catch (error) {
    next(error);
  }
});

app.get("/api/campaigns/:id", async (req, res, next) => {
  try {
    const campaign = await readCampaign(req.params.id);
    if (!campaign) {
      throw new NotFoundError("Campaign not found.", { id: req.params.id });
    }
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const response = toErrorResponse(error, res.locals.requestId || "req_unknown");
  res.status(response.status).json(response.body);
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(root, "dist/client")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(root, "dist/client/index.html"));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: "spa"
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;
      const template = await fs.readFile(path.join(root, "index.html"), "utf8");
      const html = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  });
}

app.listen(port, () => {
  console.log(`ClausePay running at http://localhost:${port}`);
});
