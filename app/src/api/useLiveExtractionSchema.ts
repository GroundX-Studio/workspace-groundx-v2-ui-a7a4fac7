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
import { useEffect, useState } from "react";

import { getGroundXWorkflow } from "@/api/entities/groundxWorkflowsEntity";
import { isResolvedDocumentId } from "@/api/documentId";
import { workflowToSchema } from "@/api/extractLiveData";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import type { ExtractionSchemaDef } from "@/types/scenarios";

type GetDocument = ReturnType<typeof useDocumentsContext>["getDocument"];

const cache = new Map<string, Promise<ExtractionSchemaDef | null>>();

/** Test seam — clears the per-doc schema cache. */
export function __clearLiveSchemaCache(): void {
  cache.clear();
}

/**
 * Resolve `documentId → filter.workflow_id → getGroundXWorkflow →
 * workflowToSchema`. Pure-ish (takes `getDocument` so it's unit-testable
 * without a provider). Returns null when there's no workflow id.
 */
export async function fetchLiveSchema(
  documentId: string,
  getDocument: GetDocument,
): Promise<ExtractionSchemaDef | null> {
  const doc = await getDocument(documentId);
  const workflowId = (doc.response?.filter as Record<string, unknown> | undefined)?.workflow_id;
  if (typeof workflowId !== "string") return null;
  const wf = await getGroundXWorkflow(workflowId);
  return workflowToSchema(wf.workflow);
}

export function useLiveExtractionSchema(documentId: string | undefined): ExtractionSchemaDef | null {
  const { getDocument } = useDocumentsContext();
  const [schema, setSchema] = useState<ExtractionSchemaDef | null>(null);

  useEffect(() => {
    if (!documentId || !isResolvedDocumentId(documentId)) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    let promise = cache.get(documentId);
    if (!promise) {
      promise = fetchLiveSchema(documentId, getDocument).catch(() => null);
      cache.set(documentId, promise);
    }
    void promise.then((s) => {
      if (!cancelled) setSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, getDocument]);

  return schema;
}
