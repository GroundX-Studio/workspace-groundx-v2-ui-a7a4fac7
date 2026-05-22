// FIXTURE_PLACEHOLDER — content here is synthetic and needs product approval
// before Phase 7. Shape contract is locked; values can change freely.
import type { ScenarioFixture } from "./types";

export const utilityFixture: ScenarioFixture = {
  scenario: "utility",
  hero: {
    title: "Utility Bill",
    subtitle: "1 doc · 3 pages · 8 meters · 56 charges",
    badges: ["E"],
    shortDesc: "a single billing statement with 8 meters and 56 charges across 3 pages",
    demonstrates: "messy layout → clean extraction",
    chapters: { extract: "live", interact: "live", report: "off" },
    docCount: "1 doc",
  },
  docs: [
    {
      id: "utility-bill-2026-04",
      title: "April 2026 Statement.pdf",
      pageCount: 3,
      mimeType: "application/pdf",
    },
  ],
  thinkingNotes: [
    "parsing layout · page 1",
    "found header · account 1023456",
    "extracting meter table · 8 rows",
    "extracting charge ledger · 56 rows",
    "matching legend to charge codes",
    "confidence check · 96% mean",
  ],
  schema: {
    id: "utility-schema-v1",
    name: "Utility Bill",
    categories: [
      {
        id: "statement",
        type: "statement",
        name: "Statement",
        fields: [
          {
            id: "account_number",
            name: "Account number",
            type: "STRING",
            description: "The account number printed in the statement header.",
            value: "1023456",
            citations: [
              { documentId: "utility-bill-2026-04", page: 1, bbox: { x: 0.06, y: 0.07, w: 0.18, h: 0.03 } },
            ],
          },
          {
            id: "billing_period_start",
            name: "Billing period start",
            type: "DATE",
            description: "Start of the billing period printed in the statement.",
            value: "2026-03-15",
            citations: [
              { documentId: "utility-bill-2026-04", page: 1, bbox: { x: 0.06, y: 0.12, w: 0.16, h: 0.025 } },
            ],
          },
          {
            id: "billing_period_end",
            name: "Billing period end",
            type: "DATE",
            description: "End of the billing period printed in the statement.",
            value: "2026-04-14",
            citations: [
              { documentId: "utility-bill-2026-04", page: 1, bbox: { x: 0.22, y: 0.12, w: 0.16, h: 0.025 } },
            ],
          },
          {
            id: "amount_due",
            name: "Amount due",
            type: "NUMBER",
            description: "Total amount due across all meters and charges, USD.",
            value: 18742.16,
            citations: [
              { documentId: "utility-bill-2026-04", page: 1, bbox: { x: 0.70, y: 0.14, w: 0.16, h: 0.04 } },
            ],
          },
          {
            id: "due_date",
            name: "Due date",
            type: "DATE",
            description: "The due date printed on the statement.",
            value: "2026-05-08",
            citations: [
              { documentId: "utility-bill-2026-04", page: 1, bbox: { x: 0.70, y: 0.19, w: 0.16, h: 0.025 } },
            ],
          },
        ],
      },
      {
        id: "meters",
        type: "meters",
        name: "Meters",
        // FIXTURE_PLACEHOLDER — only first 2 meters shown; spec calls for 8.
        fields: [
          {
            id: "meter_001",
            name: "Meter 001 · kWh consumed",
            type: "NUMBER",
            description: "kWh consumed by meter 001 during the billing period.",
            value: 4128,
            citations: [
              { documentId: "utility-bill-2026-04", page: 2, bbox: { x: 0.08, y: 0.32, w: 0.10, h: 0.025 } },
            ],
          },
          {
            id: "meter_002",
            name: "Meter 002 · kWh consumed",
            type: "NUMBER",
            description: "kWh consumed by meter 002 during the billing period.",
            value: 5512,
            citations: [
              { documentId: "utility-bill-2026-04", page: 2, bbox: { x: 0.08, y: 0.34, w: 0.10, h: 0.025 } },
            ],
          },
        ],
      },
    ],
  },
  chatScript: [
    { id: "u1", role: "user", content: "What's our largest charge category this month?" },
    {
      id: "a1",
      role: "assistant",
      content:
        "Demand charges came in highest at $9,418, up 12% from March. Generation followed at $6,205, then Transmission at $2,118 [1].",
      citations: [
        { documentId: "utility-bill-2026-04", page: 3, snippet: "Demand Charges — $9,418" },
      ],
    },
  ],
};
