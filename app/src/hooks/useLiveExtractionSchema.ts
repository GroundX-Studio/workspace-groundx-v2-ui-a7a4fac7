import { useEffect, useState } from "react";

import { isResolvedDocumentId } from "@/api/documentId";
import { fetchLiveSchema } from "@/hooks/liveExtractionSchemaData";
import { useApi } from "@/contexts/ApiContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import type { ExtractionSchemaDef } from "@/types/scenarios";

const cache = new Map<string, Promise<ExtractionSchemaDef | null>>();

/** Test seam — clears the per-doc schema cache. */
export function __clearLiveSchemaCache(): void {
  cache.clear();
}

export function useLiveExtractionSchema(documentId: string | undefined): ExtractionSchemaDef | null {
  const api = useApi();
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
      promise = fetchLiveSchema(documentId, getDocument, api.workflow.getGroundXWorkflow).catch(() => null);
      cache.set(documentId, promise);
    }
    void promise.then((s) => {
      if (!cancelled) setSchema(s);
    });
    return () => {
      cancelled = true;
    };
  }, [api.workflow, documentId, getDocument]);

  return schema;
}
