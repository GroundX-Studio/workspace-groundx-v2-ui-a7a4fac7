// FIXTURE_PLACEHOLDER — content here is synthetic and needs product approval
// before Phase 7. Shape contract is locked; values can change freely.
import type { ScenarioFixture } from "./types";

// Solar portfolio: 142 docs across 3 funds × ~4-5 projects each. Synthetic
// names; product owns the real allocation packet.
const PROJECT_NAMES = ["Sundance", "Greenfield", "Plainview", "Cottonwood", "Bridger"];
const FUND_NAMES = ["Fund I 2023", "Fund II 2024", "Fund III 2025"];

const docs = Array.from({ length: 142 }, (_, i) => {
  const fundIdx = i % FUND_NAMES.length;
  const projectIdx = Math.floor(i / FUND_NAMES.length) % PROJECT_NAMES.length;
  const fund = FUND_NAMES[fundIdx];
  const project = PROJECT_NAMES[projectIdx];
  const docKinds = [
    "PPA.pdf",
    "Permit set.pdf",
    "Engineering study.pdf",
    "Land lease.pdf",
    "Financial model.xlsx",
    "Insurance certificate.pdf",
  ];
  const kind = docKinds[i % docKinds.length];
  return {
    id: `solar-doc-${i + 1}`,
    title: `${fund} · ${project} · ${kind}`,
    pageCount: 1 + ((i * 7) % 23),
  };
});

export const solarFixture: ScenarioFixture = {
  scenario: "solar",
  hero: {
    title: "Solar Project Portfolio",
    subtitle: "142 docs · 3 funds · 15 projects",
    badges: ["I", "R"],
    shortDesc: "agreements, leases, permits, engineering studies — a whole fund's worth of project diligence",
    demonstrates: "cross-document intelligence at scale",
    chapters: { extract: "off", interact: "live", report: "live" },
    docCount: "142 docs",
  },
  docs,
  thinkingNotes: [
    "indexing 142 docs",
    "building portfolio hierarchy · 3 funds · 15 projects",
    "extracting key terms from PPAs",
    "scanning permits for jurisdictional risk",
    "rolling up financials by fund",
    "confidence check · 88% mean",
  ],
  chatScript: [
    { id: "u1", role: "user", content: "Which projects have the highest permitting risk?" },
    {
      id: "a1",
      role: "assistant",
      content:
        "Sundance and Cottonwood top the risk list. Sundance is awaiting county sign-off on conditional use [1]; Cottonwood has an open Phase II environmental review [2].",
      citations: [
        { documentId: "solar-doc-2", page: 4, snippet: "Conditional Use Permit — pending" },
        { documentId: "solar-doc-4", page: 11, snippet: "Phase II ESA in progress" },
      ],
    },
  ],
  report: {
    id: "solar-ic-brief-v1",
    name: "Solar Portfolio · IC brief",
    sections: [
      {
        id: "exec_summary",
        name: "Executive summary",
        renderAs: "PARAGRAPH",
        content:
          "Portfolio of 15 utility-scale solar projects across three funds. Top-line capacity 412 MW DC. Two projects (Sundance, Cottonwood) flagged with permitting risk; the rest are at or near commercial operation.",
      },
      {
        id: "risk_rollup",
        name: "Risk roll-up",
        renderAs: "TABLE",
        content: "project | risk | source",
      },
      {
        id: "comparable",
        name: "Comparable projects",
        renderAs: "BULLETS",
        content: "Bridger, Greenfield, Plainview",
      },
      {
        id: "recommendation",
        name: "Recommendation",
        renderAs: "PARAGRAPH",
        content:
          "Proceed to investment committee with conditions: (1) hold Sundance until conditional-use clears; (2) accept Cottonwood subject to ESA Phase II closure.",
      },
    ],
  },
};
