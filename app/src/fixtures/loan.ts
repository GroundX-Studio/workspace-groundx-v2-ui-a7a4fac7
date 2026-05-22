// FIXTURE_PLACEHOLDER — content here is synthetic and needs product approval
// before Phase 7. Shape contract is locked; values can change freely.
import type { ScenarioFixture } from "./types";

const docs = Array.from({ length: 12 }, (_, i) => ({
  id: `loan-doc-${i + 1}`,
  title:
    [
      "Paystub Mar 14.pdf",
      "Paystub Mar 28.pdf",
      "Paystub Apr 11.pdf",
      "Paystub Apr 25.pdf",
      "W-2 2025.pdf",
      "Bank statement Jan.pdf",
      "Bank statement Feb.pdf",
      "Bank statement Mar.pdf",
      "Bank statement Apr.pdf",
      "Employment verification letter.pdf",
      "1099-INT 2025.pdf",
      "Rental application.pdf",
    ][i] ?? `Loan doc ${i + 1}.pdf`,
  pageCount: 1 + (i % 3),
}));

export const loanFixture: ScenarioFixture = {
  scenario: "loan",
  hero: {
    title: "Loan Eligibility",
    subtitle: "12 docs · 24 pages · 5 categories",
    badges: ["E", "I"],
  },
  docs,
  thinkingNotes: [
    "ingesting 12 docs · 24 pages",
    "classifying · 4 paystubs · 1 W-2 · 4 statements · 1 letter · 1 1099 · 1 app",
    "running employment + income models",
    "checking debt-to-income",
    "anomaly scan",
    "confidence check · 91% mean",
  ],
  schema: {
    id: "loan-schema-v1",
    name: "Loan Eligibility",
    categories: [
      {
        id: "income",
        type: "statement",
        name: "Income",
        fields: [
          {
            id: "gross_monthly_income",
            name: "Gross monthly income",
            type: "NUMBER",
            description: "Average gross monthly income from paystubs (4-month rolling).",
            value: 8420.5,
            citations: [
              { documentId: "loan-doc-1", page: 1, snippet: "Gross pay $2,105.13" },
              { documentId: "loan-doc-2", page: 1 },
              { documentId: "loan-doc-3", page: 1 },
              { documentId: "loan-doc-4", page: 1 },
            ],
          },
          {
            id: "w2_annual_wages",
            name: "W-2 annual wages",
            type: "NUMBER",
            description: "Box 1 wages on the 2025 W-2.",
            value: 98_640,
            citations: [{ documentId: "loan-doc-5", page: 1 }],
          },
        ],
      },
      {
        id: "debt",
        type: "statement",
        name: "Debt",
        fields: [
          {
            id: "monthly_debt",
            name: "Recurring monthly debt",
            type: "NUMBER",
            description: "Sum of recurring debt payments visible across statements.",
            value: 1_847,
            citations: [
              { documentId: "loan-doc-6", page: 2 },
              { documentId: "loan-doc-7", page: 2 },
            ],
          },
        ],
      },
      {
        id: "anomalies",
        type: "charges",
        name: "Anomalies",
        fields: [
          {
            id: "anom_paystub_gap",
            name: "Paystub gap",
            type: "STRING",
            description: "Gap between expected and observed paystub cadence.",
            value: "No gaps detected.",
            citations: [],
          },
        ],
      },
    ],
  },
  chatScript: [
    { id: "u1", role: "user", content: "Does this applicant meet our 35% DTI threshold?" },
    {
      id: "a1",
      role: "assistant",
      content:
        "Estimated DTI is 22%. Monthly debt is $1,847 against a gross monthly income of $8,420 [1][2]. They're well under the 35% threshold.",
      citations: [
        { documentId: "loan-doc-1", page: 1, snippet: "Gross pay $2,105.13" },
        { documentId: "loan-doc-6", page: 2, snippet: "Auto loan $612.00" },
      ],
    },
  ],
};
