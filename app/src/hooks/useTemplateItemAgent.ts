/**
 * agentic-template-item-editor — the shared "rewrite with agent" hook.
 *
 * Owns ONLY the async rewrite op + its proposal/loading/error state — NOT the
 * editor form state (the components keep their own `useState`; on Accept they
 * apply the proposed item to their setters). One hook across all three editor
 * surfaces (anon extract, authed extract, report builder); parameterized by the
 * item `kind`. Preview/rerun stays on each surface's existing path (extract's
 * `fireExtraction`; report's section-preview), so this hook is rewrite-only.
 */
import { useCallback, useState } from "react";

import type { RewriteItemRequest, RewriteItemResult, TemplateItemKind } from "@groundx/shared";

import { useApi } from "@/contexts/ApiContext";

export interface RequestRewriteArgs {
  chatSessionId: string;
  /** The current (unsaved) item definition from the editor form. */
  item: RewriteItemRequest["item"];
  /** The item's latest preview result, if any (grounds the rewrite). */
  currentResult?: RewriteItemRequest["currentResult"];
}

export interface UseTemplateItemAgent {
  /** The agent's proposed rewrite, awaiting Accept/Discard; null when none. */
  proposal: RewriteItemResult | null;
  rewriting: boolean;
  rewriteError: string | null;
  requestRewrite: (args: RequestRewriteArgs) => Promise<void>;
  discardProposal: () => void;
}

export function useTemplateItemAgent(kind: TemplateItemKind): UseTemplateItemAgent {
  const api = useApi();
  const [proposal, setProposal] = useState<RewriteItemResult | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  const requestRewrite = useCallback(
    async ({ chatSessionId, item, currentResult }: RequestRewriteArgs) => {
      setRewriting(true);
      setRewriteError(null);
      setProposal(null);
      try {
        const result = await api.templateItem.rewrite({
          chatSessionId,
          kind,
          item,
          ...(currentResult ? { currentResult } : {}),
        } as RewriteItemRequest);
        setProposal(result);
      } catch (err) {
        setRewriteError(err instanceof Error ? err.message : "rewrite failed");
      } finally {
        setRewriting(false);
      }
    },
    [api, kind],
  );

  const discardProposal = useCallback(() => setProposal(null), []);

  return { proposal, rewriting, rewriteError, requestRewrite, discardProposal };
}
