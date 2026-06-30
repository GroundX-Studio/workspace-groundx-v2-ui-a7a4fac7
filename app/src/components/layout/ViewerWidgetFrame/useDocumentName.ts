/**
 * useDocumentName — resolve a document's display name (viewer-nav-redesign).
 *
 * Order (cheapest first; the fetch is the authoritative fallback):
 *   1. DocumentsContext `selectedDocument` / `documents[]` (steady, already-loaded).
 *   2. The active onboarding scenario fixtures (`scenario.documents[].fileName`).
 *   3. **Authoritative fetch** — `DocumentsContext.getDocument(id)` (the GroundX
 *      document metadata the viewer itself reads). Needed because the loaded
 *      scenario/list data often carries a `documentId` but NO `fileName`
 *      (ChatColumn falls back to "sample.pdf" for the same reason), so state
 *      alone cannot resolve the name in onboarding. Cached per id; never refetches.
 *
 * Reads the RAW `DocumentsContext` + the OPTIONAL scenario hook, so it returns
 * `undefined` (→ caller shows a placeholder) when no provider is mounted — the
 * bare `ScopedCanvas` unit tests stay green.
 *
 * `options.fetchFallback` (default `true`) gates step (3). The doc-viewer
 * surface passes `false`: there the `PdfViewer` it mounts already fetches the
 * X-Ray (which carries `fileName`) and reports the name up, so this hook's
 * own `getDocument` would be a DUPLICATE round-trip. The synchronous state
 * resolution (steady's instant title) is unaffected — only the fetch is
 * suppressed; the viewer-reported name fills the gap.
 */
import { useContext, useEffect, useMemo, useState } from "react";

import { isResolvedDocumentId } from "@/api/documentId";
import { DocumentsContext } from "@/contexts/DocumentsContext/DocumentsContext";
import { useScenarioRegistryOptional } from "@/contexts/ScenarioRegistryContext";

export interface UseDocumentNameOptions {
  /**
   * Whether to fall back to the authoritative `getDocument` fetch when state
   * carries no name. Default `true`. The doc-viewer surface sets `false` (the
   * viewer it mounts already resolves + reports the name), so the nav never
   * issues a second round-trip for the same document.
   */
  fetchFallback?: boolean;
}

export function useDocumentName(
  documentId: string | undefined,
  options?: UseDocumentNameOptions,
): string | undefined {
  const fetchFallback = options?.fetchFallback ?? true;
  const docs = useContext(DocumentsContext);
  const registry = useScenarioRegistryOptional();
  const [fetched, setFetched] = useState<Record<string, string>>({});

  // (1)(2) — synchronous resolution from already-loaded state. No fetch.
  const fromState = useMemo(() => {
    if (!documentId) return undefined;
    const selected = docs?.selectedDocument;
    if (selected?.documentId === documentId && selected.fileName) return selected.fileName;

    const inList = docs?.documents.find((d) => d.documentId === documentId)?.fileName;
    if (inList) return inList;

    for (const scenario of registry?.state.scenarios ?? []) {
      const doc = scenario.documents.find((d) => d.documentId === documentId);
      if (doc?.fileName) return doc.fileName;
    }
    return undefined;
  }, [documentId, docs?.selectedDocument, docs?.documents, registry?.state.scenarios]);

  // (3) — authoritative fetch, only when state lacked a name. Cached per id.
  // The doc-viewer surface opts OUT (`fetchFallback: false`): the PdfViewer it
  // mounts already fetches this doc's X-Ray (which carries `fileName`) and
  // reports the name up, so this `getDocument` would be a DUPLICATE round-trip.
  // Other callers keep the fetch — state alone can't resolve the name when no
  // viewer is resolving it out-of-band.
  const getDocument = docs?.getDocument;
  useEffect(() => {
    // Gate on a RESOLVED GroundX id (same as the viewer): the canvas mounts with
    // a placeholder id (`scenario:utility`) before the active entity resolves the
    // real UUID — fetching that 406s. Skip until a real id arrives in the scope.
    if (
      !fetchFallback ||
      !isResolvedDocumentId(documentId) ||
      fromState ||
      fetched[documentId] ||
      !getDocument
    ) {
      return;
    }
    let cancelled = false;
    void getDocument(documentId).then((result) => {
      if (cancelled || !result.isSuccess) return;
      const name = result.response.fileName;
      if (name) setFetched((prev) => ({ ...prev, [documentId]: name }));
    });
    return () => {
      cancelled = true;
    };
  }, [documentId, fromState, fetched, getDocument, fetchFallback]);

  if (!documentId) return undefined;
  return fromState ?? fetched[documentId];
}
