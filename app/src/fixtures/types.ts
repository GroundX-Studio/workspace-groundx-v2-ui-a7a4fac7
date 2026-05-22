/**
 * Placeholder fixture shapes — used in MOCK_MODE so views can be built
 * against deterministic data while the real widgets + Partner/GroundX wire-up
 * lands later.
 *
 * Every literal value in `utility.ts`, `loan.ts`, `solar.ts` is tagged with
 * `// FIXTURE_PLACEHOLDER` so product can grep for content that needs
 * approval before Phase 7.
 *
 * Shape contracts must NOT drift; only literal content can change. See
 * `project-scenario-fixtures` memory.
 */

import type { Citation, Scenario } from "@/types/onboarding";

export interface FixtureDoc {
  id: string;
  title: string;
  /** Total page count. */
  pageCount: number;
  /** URL to a page image — Phase 7 will swap in real assets. */
  thumbnailUrl?: string;
  /** Optional MIME, defaults to application/pdf. */
  mimeType?: string;
}

export interface FixtureField {
  id: string;
  name: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
  description: string;
  /** Extracted value for the placeholder fixture. */
  value: string | number | boolean | null;
  citations: Citation[];
}

export interface FixtureCategory {
  id: string;
  /** statement (per-doc) | charges (repeating) | meters (repeating utility). */
  type: "statement" | "charges" | "meters";
  name: string;
  fields: FixtureField[];
}

export interface FixtureSchema {
  id: string;
  name: string;
  categories: FixtureCategory[];
}

export interface FixtureChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export interface FixtureReportSection {
  id: string;
  name: string;
  renderAs: "PARAGRAPH" | "BULLETS" | "TABLE";
  /** Raw answer text. */
  content: string;
  citations?: Citation[];
}

export interface FixtureReport {
  id: string;
  name: string;
  sections: FixtureReportSection[];
}

export interface ScenarioFixture {
  scenario: Scenario;
  /** Marketing-facing card copy in F1. */
  hero: { title: string; subtitle: string; badges: ("E" | "I" | "R")[] };
  docs: FixtureDoc[];
  schema?: FixtureSchema;
  chatScript: FixtureChatTurn[];
  report?: FixtureReport;
  /** Thinking-notes shown during F2 understand animation. */
  thinkingNotes: string[];
}
