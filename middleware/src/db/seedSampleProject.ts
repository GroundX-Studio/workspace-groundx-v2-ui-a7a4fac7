/**
 * 2026-06-01-projects-rbac-scope-filter — seed the public sample project.
 *
 * The sample project is the FIRST row in the `projects` table: a single
 * app-owned project (a real `proj_<uuid>` id, never a slug) living in the
 * shared samples bucket, readable by EVERYONE via a `public/viewer` grant. Its
 * id is the value stamped on the sample document's GroundX `filter.projectId`,
 * so the scope→GroundX-filter path resolves to it for both anonymous onboarding
 * and signed-in callers.
 *
 * Idempotent: re-inserts (UPSERT) the same stable id on every boot, so it never
 * duplicates and always reconciles to the canonical shape.
 */
import { SAMPLE_REPORT_TEMPLATE_ID } from "@groundx/shared";

import { reportTemplateToSaveInput, type ReportTemplate } from "../services/reportRenderer.js";
import type { AppRepository } from "../types.js";

/** Stable, unique project id for the seeded Utility sample. Real UUID, namespaced. */
export const SAMPLE_PROJECT_ID = "proj_c7701da7-0e08-482a-a496-df9dfe991613";
export const SAMPLE_PROJECT_NAME = "Utility Bill (sample)";

/**
 * report-default-template — the reserved owner of the seeded default report
 * template. `templates.groundx_username` is NOT NULL and there is no public flag
 * on the row, so a template's "public/sample" status IS this sentinel owner. It
 * must never collide with a real GroundX username (those are UUIDs / emails),
 * hence the bracketed sentinel. SERVER-ONLY — the access-scoped read endpoint
 * returns a template to anon iff its owner === this value; the client never sees
 * it. (The template id itself is `SAMPLE_REPORT_TEMPLATE_ID` in `@groundx/shared`,
 * shared with the client onboarding bootstrap.)
 */
export const SAMPLE_TEMPLATE_OWNER = "[sample-report-template-owner]";

/**
 * Scenario-slug → real project id, for the seeded sample projects. The scope
 * producer resolves a `sample:<scenarioId>` entity through this so the RAG
 * filter uses the SAME `projectId` value stamped on the doc (a real id), not
 * the slug. Only `utility` is seeded today; add a scenario here when its
 * project + doc are seeded. An unmapped scenario falls back to its slug
 * (unchanged, non-functional-until-seeded behavior).
 */
export const SAMPLE_PROJECT_ID_BY_SCENARIO: Readonly<Record<string, string>> = {
  utility: SAMPLE_PROJECT_ID,
};

export async function seedSampleProject(
  repository: Pick<AppRepository, "insertProject" | "insertProjectGrant">,
  samplesBucketId: number,
): Promise<void> {
  const now = new Date();
  await repository.insertProject({
    projectId: SAMPLE_PROJECT_ID,
    bucketId: samplesBucketId,
    name: SAMPLE_PROJECT_NAME,
    ownerUsername: null, // system-owned; visibility comes from the public grant
    isSample: true,
    createdAt: now,
    updatedAt: now,
  });
  // Everyone (anonymous + every authenticated customer) can READ the sample.
  await repository.insertProjectGrant({
    projectId: SAMPLE_PROJECT_ID,
    principalType: "public",
    principalUsername: null,
    role: "viewer",
    createdAt: now,
  });
}

/**
 * report-default-template — the seeded default report template for onboarding.
 *
 * ONE real `kind:"report"` row, owned by the `SAMPLE_TEMPLATE_OWNER` sentinel
 * (its public/sample marker, since the row has no public flag). The body is
 * produced via the SERVER serialization (`reportTemplateToSaveInput`) so a
 * `getTemplate` → `reportTemplateFromRecord` round-trip yields the same authored
 * questions the live render runs — NO hardcoded answers, NO client fixture.
 * Idempotent (saveTemplate UPSERTs by id). Its absence must never break
 * onboarding (the render degrades to the no-template empty state).
 *
 * Sections are the THREE T1-verified-groundable sections for the City of Windom
 * bill (account_activity dropped — the bill has no balance-forward / payment
 * activity; Anomalies/Recommendation dropped — would fabricate).
 */
const SAMPLE_REPORT_TEMPLATE: ReportTemplate = {
  id: SAMPLE_REPORT_TEMPLATE_ID,
  name: "Utility Bill Summary",
  format: "",
  sections: [
    {
      id: "billing_summary",
      name: "billing_summary",
      renderAs: "PARAGRAPH",
      question:
        "Summarize this utility bill: the customer / addressee, the utility company, " +
        "the statement date, the service period, the total amount due, and the payment " +
        "due date. State only what the bill shows.",
      variables: [],
    },
    {
      id: "charges_by_service",
      name: "charges_by_service",
      renderAs: "TABLE",
      question:
        "Break down the total charges by utility service (electric, water, sewer, " +
        "irrigation). For each service, give the combined amount across all of its " +
        "meters. Use only amounts stated on the bill.",
      variables: [],
    },
    {
      id: "service_accounts",
      name: "service_accounts",
      renderAs: "TABLE",
      question:
        "List each metered service account on the bill: the meter id, the utility " +
        "type, the rate plan, the usage (with its unit), and the total charges for " +
        "that meter.",
      variables: [],
    },
  ],
};

export async function seedSampleReportTemplate(
  repository: Pick<AppRepository, "saveTemplate">,
): Promise<void> {
  const now = new Date();
  const input = reportTemplateToSaveInput(SAMPLE_REPORT_TEMPLATE);
  await repository.saveTemplate({
    id: input.id,
    kind: input.kind,
    groundxUsername: SAMPLE_TEMPLATE_OWNER, // the public/sample marker (see §C predicate)
    name: input.name,
    bodyJson: JSON.stringify(input.body),
    createdAt: now,
    updatedAt: now,
  });
}
