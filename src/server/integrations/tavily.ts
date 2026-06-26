import type { EvidenceSource, PublicContextTarget } from "../../shared/types";
import { fetchWithTimeout } from "./fetchWithTimeout";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

export async function researchPublicContext(
  target: PublicContextTarget,
  campaignId: string
): Promise<{ state: "completed" | "simulated" | "failed"; evidence: EvidenceSource[]; detail: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      state: "simulated",
      evidence: fallbackEvidence(target),
      detail: "TAVILY_API_KEY is missing; returned deterministic demo evidence."
    };
  }

  const queries = [
    `${target.companyName} ${target.domain} official company profile leadership contact`,
    `${target.companyName} ${target.domain} recent news company updates`,
    `${target.companyName} ${target.domain} accounts payable supplier payment portal`
  ];

  try {
    const payloadSettled = await Promise.allSettled(queries.map((query) => searchTavily(query, apiKey, campaignId)));
    const payloads = payloadSettled
      .filter((result): result is PromiseFulfilledResult<TavilyResponse> => result.status === "fulfilled")
      .map((result) => result.value);

    const seen = new Set<string>();
    const evidence = payloads
      .flatMap((payload) => payload.results || [])
      .filter((result): result is Required<Pick<TavilyResult, "title" | "url">> & TavilyResult =>
        Boolean(result.title && result.url)
      )
      .filter((result) => {
        if (seen.has(result.url)) return false;
        seen.add(result.url);
        return true;
      })
      .slice(0, 8)
      .map((result, index) => ({
        id: `S${index + 1}`,
        title: result.title || "Untitled source",
        url: result.url || "",
        snippet: result.content || "Tavily returned this source without a text snippet.",
        source: "tavily" as const,
        confidence: normaliseScore(result.score),
        retrievedAt: new Date().toISOString()
      }));

    if (evidence.length === 0) {
      const firstFailure = payloadSettled.find(
        (result): result is PromiseRejectedResult => result.status === "rejected"
      );
      throw new Error(firstFailure?.reason instanceof Error ? firstFailure.reason.message : "Tavily returned no usable sources.");
    }

    const succeededQueries = payloads.length;
    const failedQueries = payloadSettled.length - succeededQueries;

    return {
      state: "completed",
      evidence,
      detail:
        failedQueries > 0
          ? `Tavily returned ${evidence.length} unique sources from ${succeededQueries}/${queries.length} queries.`
          : `Tavily returned ${evidence.length} unique sources.`
    };
  } catch (error) {
    return {
      state: "failed",
      evidence: fallbackEvidence(target),
      detail: error instanceof Error ? error.message : "Tavily search failed."
    };
  }
}

async function searchTavily(query: string, apiKey: string, campaignId: string): Promise<TavilyResponse> {
  const response = await fetchWithTimeout(
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(process.env.TAVILY_PROJECT ? { "X-Project-ID": process.env.TAVILY_PROJECT } : {}),
        "X-Session-Id": campaignId
      },
      body: JSON.stringify({
        query,
        search_depth: "basic",
        include_answer: true,
        include_raw_content: false,
        max_results: 4
      })
    },
    15_000,
    "Tavily"
  );

  if (!response.ok) {
    throw new Error(`Tavily returned ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as TavilyResponse;
}

function normaliseScore(score: number | undefined): number {
  if (typeof score !== "number" || Number.isNaN(score)) return 0.72;
  return Math.max(0.1, Math.min(0.99, score));
}

function fallbackEvidence(target: PublicContextTarget): EvidenceSource[] {
  const now = new Date().toISOString();
  return [
    {
      id: "S1",
      title: `${target.companyName} public website`,
      url: `https://${target.domain}`,
      snippet:
        "Demo placeholder source. Add TAVILY_API_KEY to replace this with live source-grounded web research.",
      source: "fallback",
      confidence: 0.5,
      retrievedAt: now
    },
    {
      id: "S2",
      title: "Synthetic supplier payment context",
      url: "https://example.com/synthetic-payment-context",
      snippet:
        "Synthetic context used while Tavily is unavailable. This does not assert any real debt or payment behaviour.",
      source: "fallback",
      confidence: 0.42,
      retrievedAt: now
    }
  ];
}
