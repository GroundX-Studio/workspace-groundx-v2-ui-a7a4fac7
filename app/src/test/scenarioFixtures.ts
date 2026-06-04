/**
 * Test-only ScenarioConfig fixtures. These mirror the manifest content that
 * the live registry returns from the GroundX bucket — enough shape to
 * exercise the F1-F5 views without an actual HTTP fetch.
 *
 * Production code MUST NOT import this file. Views read from the registry.
 */

import type { ScenarioConfig } from "@/types/scenarios";

export const utilityTestScenario: ScenarioConfig = {
  id: "utility",
  order: 1,
  projectId: "proj_utility",
  documents: [
    { documentId: "utility-bill-2026-04", fileName: "April 2026 Statement.pdf", order: 1 },
  ],
  manifest: {
    id: "utility",
    hero: {
      title: "Utility Bill",
      shortDesc: "a single billing statement with 8 meters and 56 charges across 3 pages",
      demonstrates: "messy layout → clean extraction",
      badges: ["E"],
      chapters: { extract: "live", interact: "live", report: "off" },
      docCount: "1 doc",
    },
    thinkingScript: [
      "parsing layout · page 1",
      "found header · account 1023456",
      "extracting meter table · 8 rows",
      "extracting charge ledger · 56 rows",
      "matching legend to charge codes",
      "confidence check · 96% mean",
    ],
    extractionSchema: {
      id: "utility-schema-v1",
      name: "Utility Bill",
      categories: [
        {
          id: "statement",
          type: "statement",
          name: "Statement",
          fields: [
            { id: "account_number", name: "Account number", type: "STRING", description: "The account number printed in the statement header." },
            { id: "amount_due", name: "Amount due", type: "NUMBER", description: "Total amount due across all meters and charges, USD." },
          ],
        },
        {
          id: "meters",
          type: "meters",
          name: "Meters",
          fields: [
            { id: "meter_kwh", name: "kWh consumed", type: "NUMBER", description: "kWh consumed by the meter during the billing period." },
          ],
        },
      ],
    },
    chatSeeds: [
      { id: "u1", prompt: "What's our largest charge category this month?", rationale: "Tests RAG over the charge ledger." },
    ],
    sampleExtractionValues: [
      {
        fieldId: "account_number",
        value: "1023456",
        citations: [{ documentId: "utility-bill-2026-04", page: 1 }],
      },
      {
        fieldId: "amount_due",
        value: 18742.16,
        citations: [{ documentId: "utility-bill-2026-04", page: 1 }],
      },
      {
        fieldId: "meter_kwh",
        value: 4128,
        citations: [{ documentId: "utility-bill-2026-04", page: 2 }],
      },
    ],
    sampleChatScript: [
      { id: "u1", role: "user", content: "What's our largest charge category this month?" },
      {
        id: "a1",
        role: "assistant",
        content: "Demand charges came in highest at $9,418.",
        citations: [{ documentId: "utility-bill-2026-04", page: 3, snippet: "Demand Charges — $9,418" }],
      },
    ],
  },
};

export const loanTestScenario: ScenarioConfig = {
  id: "loan",
  order: 2,
  projectId: "proj_loan",
  // Loan is the docs→structured-JSON sample — the only scenario that offers
  // the table→JSON render handoff in the Extract workbench.
  supportsJsonRender: true,
  documents: [
    { documentId: "loan-doc-1", fileName: "Loan Application Packet.pdf", order: 1 },
  ],
  manifest: {
    id: "loan",
    hero: {
      title: "Loan Eligibility Packet",
      shortDesc: "paystubs, W-2, bank statements, employment letter — the bundle an underwriter reviews",
      demonstrates: "docs → structured JSON for workflows",
      badges: ["E", "I"],
      chapters: { extract: "live", interact: "live", report: "off" },
      docCount: "12 docs",
    },
    thinkingScript: ["ingesting 12 docs · 24 pages"],
    extractionSchema: {
      id: "loan-schema-v1",
      name: "Loan Eligibility",
      categories: [
        {
          id: "applicant",
          type: "statement",
          name: "Applicant",
          fields: [
            { id: "gross_monthly_income", name: "Gross monthly income", type: "NUMBER", description: "Sum of monthly gross wages." },
          ],
        },
      ],
    },
    chatSeeds: [
      { id: "l1", prompt: "Does this applicant meet our 35% DTI threshold?", rationale: "Tests aggregated reasoning." },
    ],
    sampleExtractionValues: [
      { fieldId: "gross_monthly_income", value: 7708, citations: [{ documentId: "loan-doc-1", page: 1 }] },
    ],
    sampleChatScript: [
      { id: "l1", role: "user", content: "Does this applicant meet our 35% DTI threshold?" },
      {
        id: "la1",
        role: "assistant",
        content: "Estimated DTI is 22%. The applicant clears the threshold with room to spare.",
        citations: [{ documentId: "loan-doc-1", page: 1 }],
      },
    ],
  },
};

export const solarTestScenario: ScenarioConfig = {
  id: "solar",
  order: 3,
  projectId: "proj_solar",
  documents: [
    { documentId: "solar-doc-1", fileName: "Solar Portfolio Summary.pdf", order: 1 },
  ],
  manifest: {
    id: "solar",
    hero: {
      title: "Solar Project Portfolio",
      shortDesc: "agreements, leases, permits, engineering studies — a whole fund's worth of project diligence",
      demonstrates: "cross-document intelligence at scale",
      badges: ["I", "R"],
      chapters: { extract: "off", interact: "live", report: "live" },
      docCount: "142 docs",
    },
    thinkingScript: ["ingesting portfolio"],
    // Solar deliberately omits extractionSchema — the Extract frame shows
    // the "this sample skips extract" message.
    chatSeeds: [],
    sampleChatScript: [],
  },
};

export const allTestScenarios: ScenarioConfig[] = [
  utilityTestScenario,
  loanTestScenario,
  solarTestScenario,
];
