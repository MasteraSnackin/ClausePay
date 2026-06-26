import "dotenv/config";
import express from "express";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import type { DemoPayload, RunCampaignRequest } from "../shared/types";
import { demoContract, demoInvoice, getDefaultPublicContextTarget } from "./data/demoData";
import { getEnvStatus } from "./env";
import { runRecoveryCampaign } from "./agent/runRecoveryAgent";
import { getClickHouseLedgerStats } from "./integrations/clickhouse";
import { listCampaigns, readCampaign } from "./storage/localStore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const app = express();
const port = Number(process.env.PORT || 5173);

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
    const body = (req.body || {}) as RunCampaignRequest;
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
      res.status(404).json({ error: "Campaign not found" });
      return;
    }
    res.json(campaign);
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  res.status(500).json({ error: message });
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
  console.log(`Recover AI demo running at http://localhost:${port}`);
});
