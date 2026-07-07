import { useQuery } from "@tanstack/react-query";

import { useApi } from "@/contexts/ApiContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { isResolvedDocumentId } from "@/api/documentId";
import { queryKeys } from "@/api/queryKeys";
import { markNonRetryable } from "@/api/queryClient";
import type { SdkActionResult } from "@/contexts/sdkContextTypes";

/**
 * TanStack Query hooks for the viewer's remote reads (adopt-tanstack-query,
 * Phase 1). Each wraps the existing SDK/context method — the `SdkActionResult`
 * boundary stays; the `queryFn` adapts it (return `response`, or throw so the
 * cache owns the error + retry decision). These are additive: the legacy
 * context/effect fetch keeps working until each call site is migrated.
 */

/** Adapt an `SdkActionResult`-returning method into a throwing `queryFn`.
 *  A failure arm is thrown so TanStack Query's retry predicate sees it. */
export async function unwrap<T>(p: Promise<SdkActionResult<T>>): Promise<T> {
  const r = await p;
  if (r.isSuccess) return r.response;
  throw r.error;
}

/** Same, but tags the thrown error non-retryable — for reads whose failure is a
 *  consistent parse/validation error (e.g. X-Ray schema parse), not transient. */
export async function unwrapParseSensitive<T>(p: Promise<SdkActionResult<T>>): Promise<T> {
  const r = await p;
  if (r.isSuccess) return r.response;
  throw markNonRetryable(
    r.error instanceof Error ? r.error : new Error(String(r.error ?? "read failed")),
  );
}

export function useDocumentQuery(documentId: string | undefined) {
  const { getDocument } = useDocumentsContext();
  const enabled = !!documentId && isResolvedDocumentId(documentId);
  return useQuery({
    queryKey: queryKeys.document(documentId ?? "∅"),
    queryFn: () => unwrap(getDocument(documentId as string)),
    enabled,
  });
}

export function useXrayQuery(documentId: string | undefined) {
  const { getDocumentXray } = useDocumentsContext();
  const enabled = !!documentId && isResolvedDocumentId(documentId);
  return useQuery({
    queryKey: queryKeys.xray(documentId ?? "∅"),
    // X-Ray parse is a consistent error — don't retry it (matches the old
    // network-only retry loop that parsed once outside the retries).
    queryFn: () => unwrapParseSensitive(getDocumentXray(documentId as string)),
    enabled,
  });
}

export function useExtractQuery(documentId: string | undefined) {
  const { getDocumentExtract } = useDocumentsContext();
  const enabled = !!documentId && isResolvedDocumentId(documentId);
  return useQuery({
    queryKey: queryKeys.extract(documentId ?? "∅"),
    queryFn: () => unwrap(getDocumentExtract(documentId as string)),
    enabled,
  });
}

/** Workflow read goes through the flat `api.workflow` client (no context, not an
 *  SdkActionResult — it throws on error). Keyed off the resolved workflow id. */
export function useWorkflowQuery(workflowId: string | undefined) {
  const api = useApi();
  const enabled = !!workflowId;
  return useQuery({
    queryKey: queryKeys.workflow(workflowId ?? "∅"),
    queryFn: async () => (await api.workflow.getGroundXWorkflow(workflowId as string)).workflow,
    enabled,
  });
}
