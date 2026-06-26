import type {
  ContractClause,
  Invoice,
  OntologyEdge,
  OntologyNode,
  OntologyResult,
  PublicContextTarget
} from "../../shared/types";

export async function runPrometheuxOntology(params: {
  invoice: Invoice;
  clauses: ContractClause[];
  target: PublicContextTarget;
  daysOverdue: number;
  riskScore: number;
}): Promise<OntologyResult> {
  const programme = buildVadalogProgramme(params);
  const graph = buildOntologyGraph(params);
  const engineUrl = process.env.PROMETHEUX_ENGINE_URL;

  if (!engineUrl) {
    return {
      state: "simulated",
      programme,
      ...graph,
      result: {
        exported: true,
        detail: "PROMETHEUX_ENGINE_URL is missing; exported ontology programme locally."
      }
    };
  }

  try {
    const response = await fetch(`${engineUrl.replace(/\/$/, "")}/vadalog/evaluate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PROMETHEUX_API_TOKEN
          ? { Authorization: `Bearer ${process.env.PROMETHEUX_API_TOKEN}` }
          : {})
      },
      body: JSON.stringify({ program: programme })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Prometheux returned ${response.status}: ${summarisePrometheuxError(errorText)}`);
    }

    return {
      state: "completed",
      programme,
      ...graph,
      result: await response.json()
    };
  } catch (error) {
    return {
      state: "failed",
      programme,
      ...graph,
      error: error instanceof Error ? error.message : "Prometheux evaluation failed."
    };
  }
}

function buildOntologyGraph(params: {
  invoice: Invoice;
  clauses: ContractClause[];
  target: PublicContextTarget;
  daysOverdue: number;
  riskScore: number;
}): { nodes: OntologyNode[]; edges: OntologyEdge[] } {
  const invoiceNode = `invoice:${params.invoice.id}`;
  const debtorNode = "debtor:synthetic";
  const contextNode = `public-context:${slug(params.target.companyName)}`;
  const nodes: OntologyNode[] = [
    {
      id: invoiceNode,
      label: params.invoice.id,
      type: "Invoice",
      data: {
        amount: params.invoice.amount,
        currency: params.invoice.currency,
        dueDate: params.invoice.dueDate,
        daysOverdue: params.daysOverdue
      }
    },
    {
      id: debtorNode,
      label: params.invoice.debtorName,
      type: "Debtor",
      data: {
        synthetic: true,
        email: params.invoice.debtorEmail
      }
    },
    {
      id: contextNode,
      label: params.target.companyName,
      type: "PublicContextTarget",
      data: {
        domain: params.target.domain,
        contextOnly: params.target.contextOnly
      }
    },
    {
      id: "risk:collection",
      label: "Collection Risk",
      type: "Risk",
      data: {
        score: params.riskScore
      }
    }
  ];

  for (const clause of params.clauses) {
    nodes.push({
      id: `clause:${clause.id}`,
      label: `Clause ${clause.id}`,
      type: "ContractClause",
      data: {
        page: clause.page,
        title: clause.title,
        text: clause.text
      }
    });
  }

  const edges: OntologyEdge[] = [
    { from: invoiceNode, to: debtorNode, label: "owed_by" },
    { from: invoiceNode, to: "risk:collection", label: "has_risk" },
    { from: debtorNode, to: contextNode, label: "researched_with_context" },
    ...params.clauses.map((clause) => ({
      from: invoiceNode,
      to: `clause:${clause.id}`,
      label: "governed_by"
    }))
  ];

  return { nodes, edges };
}

function buildVadalogProgramme(params: {
  invoice: Invoice;
  clauses: ContractClause[];
  target: PublicContextTarget;
  daysOverdue: number;
  riskScore: number;
}): string {
  const escapedDebtor = escapeVadalogString(params.invoice.debtorName);
  const escapedContext = escapeVadalogString(params.target.companyName);
  const facts = [
    `invoice("${params.invoice.id}", "${escapedDebtor}", ${Math.round(params.invoice.amount)}, "${params.invoice.currency}").`,
    `days_overdue("${params.invoice.id}", ${params.daysOverdue}).`,
    `public_context("${params.invoice.id}", "${escapedContext}", "${escapeVadalogString(params.target.domain)}").`,
    `risk_score("${params.invoice.id}", ${Math.round(params.riskScore)}).`,
    ...params.clauses.map(
      (clause) =>
        `contract_clause("${params.invoice.id}", "${clause.id}", "${escapeVadalogString(
          clause.title
        )}", "${escapeVadalogString(clause.text)}").`
    ),
    `eligible_for_recovery(I) <- invoice(I, Debtor, Amount, Currency), days_overdue(I, Days).`,
    `recovery_clause(I, ClauseId, Title) <- contract_clause(I, ClauseId, Title, Text).`,
    `@output("eligible_for_recovery").`,
    `@output("recovery_clause").`
  ];

  return facts.join("\n");
}

function escapeVadalogString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function summarisePrometheuxError(errorText: string): string {
  try {
    const payload = JSON.parse(errorText) as { message?: string; detail?: string; data?: { error_code?: string } };
    const code = payload.data?.error_code ? ` (${payload.data.error_code})` : "";
    return `${payload.message || payload.detail || errorText}${code}`;
  } catch {
    return errorText;
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
