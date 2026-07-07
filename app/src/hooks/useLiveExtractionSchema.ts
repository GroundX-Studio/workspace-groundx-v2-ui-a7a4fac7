import { useQuery } from "@tanstack/react-query";

import { isResolvedDocumentId } from "@/api/documentId";
import { fetchLiveSchema } from "@/hooks/liveExtractionSchemaData";
import { queryKeys } from "@/api/queryKeys";
import { useApi } from "@/contexts/ApiContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import type { ExtractionSchemaDef } from "@/types/scenarios";

/**
 * Live workflow schema for a resolved GroundX documentId.
 *
 * adopt-tanstack-query: this used to keep a hand-rolled per-doc `Promise` cache
 * (no invalidation, no dedup control). That's now TanStack Query — keyed per
 * document, so F2's pick-view pills and F3's field panel share one cached read
 * and a remount doesn't refetch the 278KB workflow blob. The pure `fetchLiveSchema`
 * (document → filter.workflow_id → getGroundXWorkflow → workflowToSchema) is the
 * `queryFn`; returns `null` for placeholder ids / no-workflow so callers fall back.
 */
export function useLiveExtractionSchema(documentId: string | undefined): ExtractionSchemaDef | null {
  const api = useApi();
  const { getDocument } = useDocumentsContext();
  const enabled = !!documentId && isResolvedDocumentId(documentId);

  const { data } = useQuery({
    queryKey: queryKeys.liveSchema(documentId ?? "∅"),
    queryFn: () => fetchLiveSchema(documentId as string, getDocument, api.workflow.getGroundXWorkflow),
    enabled,
  });

  return data ?? null;
}
