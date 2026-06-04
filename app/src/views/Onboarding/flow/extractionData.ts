/**
 * Static content for the Understand (P2) and Extract (P3) frames of the
 * canonical Utility Bill demo. Field names, values, and citations mirror the
 * spec's P3 frame; meter #3 is the hero record the doc highlights.
 */

import { AnswerCitation, ExtractedField, FieldCategory, FieldCategoryId } from "./flowTypes";

/** P2 "thinking" notes streamed into chat while the document is read. Placeholder copy. */
export const UNDERSTAND_NOTES: { title: string; body: string }[] = [
  { title: "Reading the document", body: "parsing the layout — tables, paragraphs, and figures." },
  { title: "Identifying fields", body: "grouping the extracted values by section." },
  { title: "Anchoring citations", body: "linking each value back to the page region it came from." },
  { title: "Checking confidence", body: "validating values and types before they're shown." },
];

/** The summary line that closes the Understand pass. */
export const UNDERSTAND_SUMMARY = "3 pages · 20 statement fields · 8 meters · 56 charges. Ready to analyze.";

const METER_3: ExtractedField[] = [
  { name: "METER_ID", value: "#3", citation: "[1] p.1" },
  { name: "SERVICE_TYPE", value: "commercial · TOU-B-3", citation: "[2] p.1" },
  {
    name: "PEAK_DEMAND_KW",
    value: "16.2",
    citation: "[3] p.1",
    provenance: {
      type: "kW · float",
      source: "utility-bill.pdf · page 1 · region (520, 380) → (740, 460)",
      whyMatched: [
        '"METER 3" header anchors scope to meter #3',
        '"DEMAND SUMMARY" label disambiguates from energy',
        '"Peak kW" row · unit normalized · float parse',
      ],
      confidence: 98,
      neighbors: ["off_peak_demand_kw · 9.4", "total_kwh · 892", "off_peak_kwh · 410"],
      matchBox: ["METER 3 · DEMAND SUMMARY", "Peak kW   16.2", "Off-peak kW   9.4"],
    },
  },
  { name: "ENERGY_ON_PEAK_KWH", value: "892", citation: "[4] p.1" },
  { name: "ENERGY_OFF_PEAK_KWH", value: "410", citation: "[5] p.1" },
  { name: "ENERGY_BASE_KWH", value: "90", citation: "[6] p.2" },
  { name: "DEMAND_CHARGE", value: "$412.80", citation: "[7] p.1" },
];

const STATEMENT: ExtractedField[] = [
  { name: "ACCOUNT_NUMBER", value: "8841-203-77", citation: "[1] p.1" },
  { name: "STATEMENT_DATE", value: "2026-04-30", citation: "[2] p.1" },
  { name: "BILLING_PERIOD", value: "Mar 28 – Apr 27", citation: "[3] p.1" },
  { name: "TOTAL_DUE", value: "$3,907.42", citation: "[4] p.3" },
  { name: "RATE_SCHEDULE", value: "TOU-B-3", citation: "[5] p.1", locked: true },
];

const CHARGES: ExtractedField[] = [
  { name: "DELIVERY", value: "$1,204.18", citation: "[1] p.2" },
  { name: "SUPPLY", value: "$2,310.04", citation: "[2] p.2" },
  { name: "DEMAND_CHARGE", value: "$412.80", citation: "[3] p.2" },
  { name: "TAXES_AND_FEES", value: "locked", citation: "[4] p.3", locked: true },
];

/** Utility Bill extraction, keyed by category. Meter view shows meter #3. */
export const UTILITY_BILL_CATEGORIES: Record<FieldCategoryId, FieldCategory> = {
  statement: { id: "statement", label: "statement", summary: "20", fields: STATEMENT, lockedCount: 15 },
  meters: { id: "meters", label: "meters", summary: "8 meters", fields: METER_3, lockedCount: 3 },
  charges: { id: "charges", label: "charges", summary: "56 charges", fields: CHARGES, lockedCount: 52 },
};

export const CATEGORY_ORDER: FieldCategoryId[] = ["statement", "meters", "charges"];

/** P5 second question: a grounded comparison across meters. */
export const COMPARISON_QUESTION = "How does meter #3 compare to the others?";

/** The answer's citations, each anchored to a labelled region on the doc (P5). */
export const COMPARISON_CITATIONS: AnswerCitation[] = [
  { id: "[1]", page: "p.1", label: "METER #3 · PEAK 16.2 KW", caption: "Meter #3 · 16.2 kW peak", tone: "success" },
  { id: "[2]", page: "p.1", label: "METER #1 · PEAK 12.1 KW", caption: "Meter #1 · 12.1 kW peak", tone: "info" },
  { id: "[3]", page: "p.2", label: "ON-PEAK ENERGY · PAGES 1–2", caption: "892 kWh (#3) vs 728 kWh (#1)", tone: "info" },
  { id: "[4]", page: "p.3", label: "PAGE 3 SUMMARY", caption: "6 small meters combined < #3 alone", tone: "warning" },
];

/**
 * The grounded comparison answer as text segments interleaved with citation
 * markers, co-located with COMPARISON_CITATIONS so the prose and the cited
 * values can't drift apart. A `{ cite }` segment renders as a citation chip.
 */
export type AnswerSegment = string | { cite: string };
export const COMPARISON_ANSWER: AnswerSegment[] = [
  "Meter #3 is the heaviest single load on this bill. Its peak demand of 16.2 kW ",
  { cite: "[1]" },
  " is 34% higher than the next, Meter #1 at 12.1 kW ",
  { cite: "[2]" },
  ". On-peak energy mirrors that: 892 kWh vs 728 kWh ",
  { cite: "[3]" },
  ". Of the 8 meters, only #3 and #1 land above 10 kW peak; the other six combined contribute less than #3 alone ",
  { cite: "[4]" },
  ".",
];

/** Actions in the Extract panel's MENU; gated ones require sign-in. */
export const EXTRACT_MENU_ACTIONS: { label: string; detail: string; gated: boolean }[] = [
  { label: "Save schema…", detail: "YAML · the main outcome of this view · reuse on new docs", gated: true },
  { label: "Edit schema…", detail: "add / remove / retype fields · refine the prompts", gated: true },
  { label: "Export CSV", detail: "current tab · all visible fields", gated: true },
  { label: "Export JSON", detail: "preserves nesting (per-meter arrays)", gated: true },
  { label: "Filter fields…", detail: "show / hide by name, group, confidence", gated: false },
  { label: "Group by", detail: "flat · by source page · by meter (current)", gated: false },
];

/** All data needed to drive Understand → Interact for one sample. */
export interface SampleData {
  categories: Record<FieldCategoryId, FieldCategory>;
  comparison: AnswerCitation[];
  comparisonQuestion: string;
  comparisonAnswer: AnswerSegment[];
}

/**
 * Per-sample registry. Adding Loan / Solar later is a data entry here, not new
 * branches in the components. A sample absent from this map is "not yet wired"
 * and renders a coming-soon state instead of dead-ending.
 */
export const SAMPLE_DATA: Record<string, SampleData> = {
  "utility-bill": {
    categories: UTILITY_BILL_CATEGORIES,
    comparison: COMPARISON_CITATIONS,
    comparisonQuestion: COMPARISON_QUESTION,
    comparisonAnswer: COMPARISON_ANSWER,
  },
};

export const getSampleData = (sampleId?: string): SampleData | undefined =>
  sampleId ? SAMPLE_DATA[sampleId] : undefined;
