/**
 * harden-report-render-template-access — the ONE read-access rule for a report
 * template, shared by both read paths (the builder `GET …/reports/template/:id`
 * endpoint and the live render's template load) so they cannot drift.
 *
 * Rule (no IDOR): a caller may read a report template iff it is the public
 * sample (sentinel-owned) OR they own it. `owned` (the caller IS the owner)
 * additionally drives the builder's fork-on-edit. An anonymous caller has an
 * empty username and therefore never "owns" anything.
 */
import { SAMPLE_TEMPLATE_OWNER } from "../db/seedSampleProject.js";

/** A persisted template row, minimally typed for the access decision. */
export interface ReportTemplateAccessInput {
  kind: string;
  groundxUsername?: string;
}

export function reportTemplateAccess(
  record: ReportTemplateAccessInput,
  callerUsername: string | null,
): { accessible: boolean; owned: boolean } {
  if (record.kind !== "report") return { accessible: false, owned: false };
  const owned =
    callerUsername != null && callerUsername.length > 0 && record.groundxUsername === callerUsername;
  const accessible = owned || record.groundxUsername === SAMPLE_TEMPLATE_OWNER;
  return { accessible, owned };
}
