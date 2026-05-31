/**
 * MOCK_MODE fixtures + canned responses for the three-mode chat router.
 *
 * Extracted from `chatRouter.ts` (§1 of 2026-05-31-core-data-followups —
 * behavior-preserving split). Owns the per-scenario fixture library and the
 * `mockResponseFor` dispatcher used by `routeChat` when `deps.mockMode` is set.
 */

import type { ChatMode, ChatRouterRequest, ChatRouterResponse } from "./chatRouterTypes.js";

/**
 * CF-09 — per-scenario MOCK_MODE fixtures. The pre-CF-09 mock always
 * returned generic "Mock RAG answer about X" copy, which made dev / QA
 * useless for testing scenario-specific UX. Now each sample has a
 * small library of canonical questions with realistic-shaped answers
 * + the right citation docId so consumers can verify routing.
 *
 * Per locked decision: keep this map IN-CODE rather than reading from
 * scenario manifests. Manifest authoring is on the product team's
 * track; the mock-mode fixtures are a dev-quality concern that should
 * be reviewable in PR + grep-friendly. When manifests grow a
 * `mockChatScript` field (SCEN-* track), this map can become a
 * fallback for scenarios without one — not a sole source of truth.
 *
 * Pattern matching is intentionally lenient (`/total/i`, `/dti/i`)
 * rather than exact strings — the user types whatever; we just need
 * to recognize the canonical intent.
 */
interface MockScenarioFixture {
  match: RegExp;
  answer: string;
  citations: Array<{ documentId: string; page: number; snippet?: string }>;
}

interface MockScenarioBundle {
  /** Friendly name baked into the fallback so it reads scenario-aware. */
  sampleName: string;
  /** Document id for the fallback citation (and tied to `sampleName`). */
  fallbackDocId: string;
  /** Question → answer fixtures, tried in order. */
  fixtures: MockScenarioFixture[];
}

const MOCK_SCENARIO_FIXTURES: Record<string, MockScenarioBundle> = {
  "sample:utility": {
    sampleName: "utility bill",
    fallbackDocId: "utility-bill-2026-04",
    fixtures: [
      {
        match: /\btotal\b|\bamount\s+due\b/i,
        answer: "The bill total is $214.07 (current charges + carryover).",
        citations: [
          {
            documentId: "utility-bill-2026-04",
            page: 1,
            snippet: "Total amount due: $214.07",
          },
        ],
      },
      {
        match: /\bdue\s*date\b|\bwhen\s+is\s+(it|this)\s+due\b/i,
        answer: "The bill is due on May 15, 2026. Late fee kicks in after May 22.",
        citations: [
          {
            documentId: "utility-bill-2026-04",
            page: 1,
            snippet: "Due date: 05/15/2026",
          },
        ],
      },
      {
        match: /\bkwh\b|\busage\b|\bconsumption\b/i,
        answer:
          "Total usage this period: 642 kWh across two meters. That's up ~8% vs. the same month last year.",
        citations: [
          {
            documentId: "utility-bill-2026-04",
            page: 2,
            snippet: "Meter A: 412 kWh; Meter B: 230 kWh",
          },
        ],
      },
    ],
  },
  "sample:loan": {
    sampleName: "loan packet",
    fallbackDocId: "loan-applicant-summary",
    fixtures: [
      {
        match: /\bdti\b|\bdebt[- ]to[- ]income\b/i,
        answer:
          "Estimated DTI is 22% (gross), comfortably under the 35% threshold. Driven by $1,210/mo recurring debt against $5,500/mo gross income.",
        citations: [
          {
            documentId: "loan-applicant-summary",
            page: 3,
            snippet: "Recurring monthly debt: $1,210",
          },
        ],
      },
      {
        match: /\bcredit\s*score\b|\bfico\b/i,
        answer:
          "Applicant's reported FICO is 742 (mid-tier prime). Most recent pull is two months old; recommend a fresh pull before final commitment.",
        citations: [
          {
            documentId: "loan-credit-report",
            page: 1,
            snippet: "FICO 8 score: 742",
          },
        ],
      },
      {
        match: /\bincome\b|\bemployment\b|\bsalary\b/i,
        answer:
          "Gross monthly income $5,500 verified across 3 paystubs + 1 employment letter. Tenure 4.2 years at current employer.",
        citations: [
          {
            documentId: "loan-employment-letter",
            page: 1,
            snippet: "Annual gross salary: $66,000",
          },
        ],
      },
    ],
  },
  "sample:solar": {
    sampleName: "solar portfolio",
    fallbackDocId: "solar-fund-overview",
    fixtures: [
      {
        match: /\birr\b|\binternal\s+rate\b/i,
        answer:
          "Top project (Fund A · Project 11) projected IRR is 14.2% (base case). Fund-wide weighted IRR: 11.8%.",
        citations: [
          {
            documentId: "solar-fund-A-project-11",
            page: 4,
            snippet: "Base-case IRR: 14.2%",
          },
        ],
      },
      {
        match: /\brisk\b/i,
        answer:
          "Highest-risk project is Fund B · Project 03 — flagged for interconnection delay + degradation curve uncertainty. Risk score 7.4/10.",
        citations: [
          {
            documentId: "solar-fund-B-project-03",
            page: 2,
            snippet: "Risk roll-up: 7.4/10",
          },
        ],
      },
      {
        match: /\bdeal\s*size\b|\b(total|fund)\s*(value|size)\b/i,
        answer:
          "Combined deal size across the 142-project portfolio is $487M, with $312M committed and $175M in pipeline.",
        citations: [
          {
            documentId: "solar-fund-overview",
            page: 1,
            snippet: "Total fund commitment: $487M",
          },
        ],
      },
    ],
  },
};

function mockRagResponse(request: ChatRouterRequest): ChatRouterResponse {
  const bundle = request.currentEntityKey ? MOCK_SCENARIO_FIXTURES[request.currentEntityKey] : null;
  if (bundle) {
    for (const fixture of bundle.fixtures) {
      if (fixture.match.test(request.newUserMessage)) {
        return {
          mode: "rag",
          answer: fixture.answer,
          citations: fixture.citations,
          suggestedActions: [{ key: "show-source", label: "Show source" }],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        };
      }
    }
    // Scenario-aware fallback: the entity matched a known bundle but
    // no canonical question matched. Better to mention the sample
    // than serve the fully-generic copy.
    return {
      mode: "rag",
      answer:
        `I can answer questions about the ${bundle.sampleName} — try asking about the ` +
        `headline values or page-specific details. ` +
        `(Mock-mode reply; live RAG would search the sample documents.)`,
      citations: [
        { documentId: bundle.fallbackDocId, page: 1, snippet: "Sample document." },
      ],
      suggestedActions: [{ key: "show-source", label: "Show source" }],
      tools: [],
      intents: [],
      toolFailures: [],
      proposedSchemaField: null,
    };
  }
  // Fully-generic fallback for pre-CF-09 callers that don't ship
  // currentEntityKey OR scenarios we haven't authored yet.
  const entityHint = request.currentEntityKey ? ` (about ${request.currentEntityKey})` : "";
  return {
    mode: "rag",
    answer: `Mock RAG answer${entityHint}: I'd cite the sample document here once GroundX search is wired.`,
    citations: [{ documentId: "mock-doc-1", page: 1, snippet: "Mock snippet for the cited page." }],
    suggestedActions: [{ key: "show-source", label: "Show source" }],
    tools: [],
    intents: [],
    toolFailures: [],
    proposedSchemaField: null,
  };
}

export function mockResponseFor(mode: ChatMode, request: ChatRouterRequest): ChatRouterResponse {
  const entityHint = request.currentEntityKey ? ` (about ${request.currentEntityKey})` : "";
  switch (mode) {
    case "rag":
      return mockRagResponse(request);
    case "structured":
      return {
        mode,
        answer: "Mock structured answer: app-state lookup would go here.",
        citations: [],
        suggestedActions: [{ key: "open-settings", label: "Open settings" }],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      };
    case "hybrid":
      return {
        mode,
        answer: `Mock hybrid answer${entityHint}: a tour-style explanation combining sample metadata with grounded snippets.`,
        citations: [{ documentId: "mock-doc-1", page: 1, snippet: "Mock snippet from a hybrid response." }],
        suggestedActions: [
          { key: "show-extract", label: "Show me the extract" },
          { key: "try-chat", label: "Try asking a question" },
        ],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      };
  }
}
