import type { Contract, Invoice, PublicContextTarget } from "../../shared/types";

export const demoInvoice: Invoice = {
  id: "INV-1042",
  debtorName: "Northstar Analytics Ltd. (synthetic)",
  debtorEmail: "accounts-payable@northstar-analytics.example",
  amount: 18450,
  currency: "GBP",
  issuedDate: "2026-04-20",
  dueDate: "2026-05-20",
  status: "overdue",
  description: "Q2 data integration and workflow automation implementation"
};

export const demoContract: Contract = {
  id: "MSA-2026-017",
  title: "Synthetic Master Services Agreement",
  effectiveDate: "2026-03-14",
  governingLaw: "England and Wales",
  sourceLabel: "Synthetic 50-page MSA excerpt",
  clauses: [
    {
      id: "5.1",
      title: "Payment Terms",
      page: 18,
      text: "Customer shall pay all undisputed invoices within thirty (30) calendar days of the invoice date."
    },
    {
      id: "5.3",
      title: "Late Payment Interest",
      page: 19,
      text: "Amounts not paid by the due date may accrue interest at 1.5% per month or the maximum rate permitted by applicable law, whichever is lower."
    },
    {
      id: "5.4",
      title: "Disputed Amounts",
      page: 19,
      text: "Customer must notify Provider in writing of any good-faith invoice dispute within ten (10) business days of receipt, including reasonable detail for the disputed line item."
    },
    {
      id: "9.2",
      title: "Suspension",
      page: 34,
      text: "Provider may suspend non-critical services after ten (10) business days' written notice if undisputed fees remain unpaid."
    }
  ]
};

export function getDefaultPublicContextTarget(): PublicContextTarget {
  return {
    companyName: process.env.DEMO_PUBLIC_COMPANY_NAME || "ClickHouse",
    domain: process.env.DEMO_PUBLIC_COMPANY_DOMAIN || "clickhouse.com",
    contextOnly: true
  };
}
