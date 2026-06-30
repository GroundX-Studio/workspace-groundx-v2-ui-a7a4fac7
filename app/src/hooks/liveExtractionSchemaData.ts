/**
 * WF-17 — shared live extraction-schema source for the onboarding journey.
 *
 * Fetches the live workflow schema (workflow → categories + fields) for a
 * resolved GroundX documentId, cached per-doc so F2's pick-view pills
 * (ChatColumn) and F3's field panel (ExtractView) never read
 * `manifest.extractionSchema`. Returns `null` for placeholder ids or
 * fetch failures so callers fall back cleanly (e.g. to the manifest until
 * WF-08 strips it).
 *
 * The cache dedupes the (278KB) workflow blob across re-renders / surfaces.
 */
import { workflowToSchema } from "@/api/extractLiveData";
import type { useDocumentsContext } from "@/contexts/DocumentsContext";
import type { ExtractionSchemaDef } from "@/types/scenarios";

type GetDocument = ReturnType<typeof useDocumentsContext>["getDocument"];
type GetWorkflow = (workflowId: string) => Promise<{ workflow: Parameters<typeof workflowToSchema>[0] }>;

/**
 * Resolve `documentId → filter.workflow_id → getGroundXWorkflow →
 * workflowToSchema`. Pure-ish (takes `getDocument` so it's unit-testable
 * without a provider). Returns null when there's no workflow id.
 */
export async function fetchLiveSchema(
  documentId: string,
  getDocument: GetDocument,
  getWorkflow: GetWorkflow,
): Promise<ExtractionSchemaDef | null> {
  const doc = await getDocument(documentId);
  const workflowId = (doc.response?.filter as Record<string, unknown> | undefined)?.workflow_id;
  if (typeof workflowId !== "string") return null;
  const wf = await getWorkflow(workflowId);
  return workflowToSchema(wf.workflow);
}
