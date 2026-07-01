/**
 * agentic-template-item-editor — client for the rewrite + section-preview
 * endpoints. Mirrors `extractField.ts` (fetch + typed ApiError subclass).
 */
import {
  ApiError,
  type PreviewReportSectionRequest,
  type RenderedSection,
  type RewriteItemRequest,
  type RewriteItemResult,
} from "@groundx/shared";

import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

export class TemplateItemApiError extends ApiError {
  constructor(message: string, status: number, detail: unknown) {
    super(message, status, detail);
    this.name = "TemplateItemApiError";
  }
}

async function postJson<T>(route: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await csrfFetch(route, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    captureException(err, { route });
    throw err;
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new TemplateItemApiError(`POST ${route} failed: ${res.status}`, res.status, detail);
    if (res.status >= 500) captureException(error, { route, status: res.status });
    throw error;
  }
  return (await res.json()) as T;
}

/** Rewrite a template item's definition with the grounded agent. */
export function rewriteTemplateItem(input: RewriteItemRequest): Promise<RewriteItemResult> {
  return postJson<RewriteItemResult>("/api/template-item/rewrite", input);
}

/** Preview a single (unsaved) report section against the session scope. */
export function previewReportSection(input: PreviewReportSectionRequest): Promise<RenderedSection> {
  return postJson<RenderedSection>("/api/report-section/preview", input);
}
