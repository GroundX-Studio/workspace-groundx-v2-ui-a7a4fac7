/**
 * 2026-06-02-flatten-document-filter — the APP-SIDE source of truth for sample
 * scenario manifests (id + order + manifest). Previously the scenario registry
 * reconstructed these by reading `manifest`/`scenarioId` off the GroundX doc
 * `filter`; now the manifest lives here (app-side) and the registry only joins
 * the bucket's documents to a scenario by `filter.projectId`. This decouples the
 * onboarding picker from GroundX document metadata and lets the GroundX search
 * `filter` be the flat `{projectId, workflow_id}` scoping key.
 *
 * The seed (`scripts/seed-bucket.ts`) reads the manifest from HERE too (one
 * source); `scripts/scenarios/<id>.json` keeps only the seed-time file mapping
 * (`documents[].filePath`).
 */
import type { ScenarioManifest } from "./types.js";

export interface SampleScenarioConfig {
  id: string;
  order: number;
  manifest: ScenarioManifest;
}

export const SAMPLE_SCENARIOS: readonly SampleScenarioConfig[] = [
  {
    id: "utility",
    order: 1,
    manifest: {
      id: "utility",
      hero: {
        title: "Utility Bill",
        shortDesc: "a single billing statement with 8 meters and 56 charges across 3 pages",
        demonstrates: "messy layout → clean extraction",
        badges: ["E", "I"],
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
      chatSeeds: [
        {
          id: "u1",
          prompt: "What's our largest charge category this month?",
          rationale: "Tests RAG over the charge ledger.",
        },
      ],
    },
  },
];
