import { useEffect, useState } from "react";

import { fetchLiveExtract, type LiveExtract } from "@/api/useLiveExtract";
import { useApi } from "@/contexts/ApiContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { isResolvedDocumentId } from "@/api/documentId";

const EMPTY: LiveExtract = { schema: null, values: [] };

/**
 * App-facing hook form: resolves the live extract for `documentId`, re-running
 * when the id changes. Network dependencies come from the injected Api surface.
 */
export function useLiveExtract(documentId: string | undefined): LiveExtract {
  const api = useApi();
  const { getDocument, getDocumentExtract } = useDocumentsContext();
  const [live, setLive] = useState<LiveExtract>(EMPTY);

  useEffect(() => {
    if (!documentId || !isResolvedDocumentId(documentId)) {
      setLive(EMPTY);
      return;
    }
    let cancelled = false;
    void fetchLiveExtract(
      documentId,
      getDocument,
      getDocumentExtract,
      api.workflow.getGroundXWorkflow,
    )
      .catch(() => EMPTY)
      .then((result) => {
        if (!cancelled) setLive(result);
      });
    return () => {
      cancelled = true;
    };
  }, [api.workflow, documentId, getDocument, getDocumentExtract]);

  return live;
}

export type { LiveExtract };
