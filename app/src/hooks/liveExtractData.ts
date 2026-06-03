/**
 * Shared live extraction source (schema + values) for surfaces that mount
 * `<SchemaView />` WITHOUT explicit live props (the standalone demo-scenario
 * mount + the ProposeSchemaFieldCard round-trip).
 *
 * This is the SAME load path the `Extract` widget runs for its live extract,
 * lifted into a reusable hook so SchemaView has a genuine live source instead
 * of falling back to `scenario.manifest.*`:
 *
 *   schema ← getDocument → filter.workflow_id → getGroundXWorkflow → workflowToSchema
 *   values ← getDocumentExtract → extractToValues
 *
 * The document/workflow/extract calls hit the real GroundX data path through
 * the middleware (the same calls the Extract widget makes); tests inject
 * real-shaped responses at the fetch seam. The standalone surfaces render live
 * data keyed by the scenario's primary
 * document. Returns `{ schema: null, values: [] }` for placeholder ids or
 * fetch failures so the caller renders its real empty/error state — never the
 * manifest.
 */
import { extractToValues, workflowToSchema } from "@/api/extractLiveData";
import type { useDocumentsContext } from "@/contexts/DocumentsContext";
import type { ExtractedFieldValue, ExtractionSchemaDef } from "@/types/scenarios";

type DocumentsApi = ReturnType<typeof useDocumentsContext>;
type GetDocument = DocumentsApi["getDocument"];
type GetDocumentExtract = DocumentsApi["getDocumentExtract"];
type GetWorkflow = (workflowId: string) => Promise<{ workflow: Parameters<typeof workflowToSchema>[0] }>;

export interface LiveExtract {
  schema: ExtractionSchemaDef | null;
  values: ExtractedFieldValue[];
}

const EMPTY: LiveExtract = { schema: null, values: [] };

/**
 * Resolve `documentId → schema + values` via the shared `extractLiveData`
 * helpers. Pure-ish (takes the loaders) so it's unit-testable without a
 * provider. Returns `{ schema: null, values: [] }` when there is no workflow
 * id or no extract.
 */
export async function fetchLiveExtract(
  documentId: string,
  getDocument: GetDocument,
  getDocumentExtract: GetDocumentExtract,
  getWorkflow: GetWorkflow,
): Promise<LiveExtract> {
  const doc = await getDocument(documentId);
  const workflowId = (doc.response?.filter as Record<string, unknown> | undefined)?.workflow_id;
  if (typeof workflowId !== "string") return EMPTY;
  const wf = await getWorkflow(workflowId);
  const schema = workflowToSchema(wf.workflow);
  if (!schema) return EMPTY;
  const ex = await getDocumentExtract(documentId);
  if (!ex.response) return { schema, values: [] };
  const valueMap = extractToValues(ex.response as Record<string, unknown>, schema);
  const values: ExtractedFieldValue[] = Object.entries(valueMap).map(([fieldId, value]) => ({
    fieldId,
    value,
    citations: [],
  }));
  return { schema, values };
}
