import { useQuery } from "@tanstack/react-query";

import { fetchLiveExtract, type LiveExtract } from "@/hooks/liveExtractData";
import { queryKeys } from "@/api/queryKeys";
import { useApi } from "@/contexts/ApiContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { isResolvedDocumentId } from "@/api/documentId";

const EMPTY: LiveExtract = { schema: null, values: [] };

/**
 * Live extract (schema + values) for `documentId`.
 *
 * adopt-tanstack-query: was an imperative `useEffect` fetch with its own
 * cancellation; now a keyed `useQuery` so a remount over the same document
 * reads the cache instead of re-hitting GroundX. The pure `fetchLiveExtract`
 * (document → workflow → extract → extractToValues) is the `queryFn`; returns
 * `{ schema: null, values: [] }` for placeholder ids / failures.
 */
export function useLiveExtract(documentId: string | undefined): LiveExtract {
  const api = useApi();
  const { getDocument, getDocumentExtract } = useDocumentsContext();
  const enabled = !!documentId && isResolvedDocumentId(documentId);

  const { data } = useQuery({
    queryKey: queryKeys.liveExtract(documentId ?? "∅"),
    queryFn: () =>
      fetchLiveExtract(documentId as string, getDocument, getDocumentExtract, api.workflow.getGroundXWorkflow),
    enabled,
  });

  return data ?? EMPTY;
}

export type { LiveExtract };
