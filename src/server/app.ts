import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import type { DemoPayload, RunCampaignRequest } from "../shared/types";
import { advanceCampaignWorkflow } from "./agent/advanceCampaignWorkflow";
import { runRecoveryCampaign } from "./agent/runRecoveryAgent";
import { demoContract, demoInvoice, getDefaultPublicContextTarget } from "./data/demoData";
import { getEnvStatus } from "./env";
import { NotFoundError, ValidationError, toErrorResponse } from "./errors";
import { getClickHouseLedgerStats } from "./integrations/clickhouse";
import { listCampaigns, readCampaign, renameCampaign } from "./storage/localStore";

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

const renameCampaignSchema = z
  .object({
    label: z.string().trim().min(1).max(80)
  })
  .strict();

export function createApiApp(): express.Express {
  const app = express();

  app.use((_req, res, next) => {
    res.locals.requestId = `req_${crypto.randomUUID().slice(0, 8)}`;
    res.setHeader("X-Request-Id", res.locals.requestId);
    next();
  });

  app.use(express.json({ limit: "1mb" }));

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

  app.post("/api/campaigns/:id/advance", async (req, res, next) => {
    try {
      const campaign = await advanceCampaignWorkflow(req.params.id);
      if (!campaign) {
        throw new NotFoundError("Campaign not found.", { id: req.params.id });
      }
      res.json(campaign);
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/campaigns/:id", async (req, res, next) => {
    try {
      const parsed = renameCampaignSchema.safeParse(req.body || {});
      if (!parsed.success) {
        throw new ValidationError("The campaign label is invalid.", {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message
          }))
        });
      }
      const campaign = await renameCampaign(req.params.id, parsed.data.label);
      if (!campaign) {
        throw new NotFoundError("Campaign not found.", { id: req.params.id });
      }
      res.json(campaign);
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

  return app;
}
