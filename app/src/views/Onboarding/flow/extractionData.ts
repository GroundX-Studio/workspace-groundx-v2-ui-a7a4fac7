/**
 * Static content for the Understand (F2) and Extract (F3) frames of the
 * canonical Utility Bill demo. Field names, values, and citations mirror the
 * spec's F3 frame; meter #3 is the hero record the doc highlights.
 */

import { ExtractedField, FieldCategory, FieldCategoryId } from "./flowTypes";

/** F2 "thinking" notes streamed into chat as GroundX reads the doc. */
export const UNDERSTAND_NOTES: { title: string; body: string }[] = [
  {
    title: "Closing the document comprehension gap",
    body: "the structural barrier general-purpose AI can't cross — the whole point of GroundX.",
  },
  { title: "Vision-first parsing", body: "I read tables, paragraphs, and figures before any LLM touches the doc." },
  {
    title: "Agentic enrichment",
    body: "narrow agents reason about each semantic object in parallel — 8 meters won't get confused with each other.",
  },
  {
    title: "Pixel-level provenance",
    body: "every value is anchored to its page region, so each citation clicks straight back to its source.",
  },
  { title: "Hybrid retrieval", body: "proprietary relevance + semantic scoring, not just embeddings." },
];

/** The summary line that closes the Understand pass. */
export const UNDERSTAND_SUMMARY = "3 pages · 20 statement fields · 8 meters · 56 charges. Ready to analyze.";

const METER_3: ExtractedField[] = [
  { name: "METER_ID", value: "#3", citation: "[1] p.1" },
  { name: "SERVICE_TYPE", value: "commercial · TOU-B-3", citation: "[2] p.1" },
  { name: "PEAK_DEMAND_KW", value: "16.2", citation: "[3] p.1" },
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

/** Actions in the Extract panel's MENU; gated ones require sign-in. */
export const EXTRACT_MENU_ACTIONS: { label: string; detail: string; gated: boolean }[] = [
  { label: "Save schema…", detail: "YAML · the main outcome of this view · reuse on new docs", gated: true },
  { label: "Edit schema…", detail: "add / remove / retype fields · refine the prompts", gated: true },
  { label: "Export CSV", detail: "current tab · all visible fields", gated: true },
  { label: "Export JSON", detail: "preserves nesting (per-meter arrays)", gated: true },
  { label: "Filter fields…", detail: "show / hide by name, group, confidence", gated: false },
  { label: "Group by", detail: "flat · by source page · by meter (current)", gated: false },
];
