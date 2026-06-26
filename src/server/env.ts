import type { EnvStatus } from "../shared/types";

export function getEnvStatus(): EnvStatus {
  return {
    tavily: Boolean(process.env.TAVILY_API_KEY),
    clickhouse: Boolean(process.env.CLICKHOUSE_URL),
    prometheux: Boolean(process.env.PROMETHEUX_ENGINE_URL),
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL)
  };
}

export function getBaseUrl(): string {
  return process.env.PUBLIC_BASE_URL || "http://localhost:5173";
}
