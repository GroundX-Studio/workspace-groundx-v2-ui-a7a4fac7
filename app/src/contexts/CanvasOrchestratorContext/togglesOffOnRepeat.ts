/**
 * Shared toggle-off-on-repeat predicate (chat-architecture-hardening Task 5).
 *
 * Both citation surfaces toggle the same way: a USER re-dispatch of the
 * exact state that's already active on the SAME document CLEARS it (click
 * again to dismiss); an agent-sourced dispatch always sets, never toggles.
 * The compared slot is the config axis — `highlightCitation` compares the
 * active `{page, bbox}` highlight, `showCitations` compares the lit-regions
 * array. One comparison implementation; deep-equality via JSON.stringify
 * (the compared values are small plain wire shapes).
 */
export function togglesOffOnRepeat<T>(args: {
  /** Who dispatched — only USER dispatches toggle. */
  source: string;
  /** The active doc-viewer step, or null when the top step isn't one. */
  activeDocViewer: { documentId: string } | null;
  /** The intent's target document. */
  documentId: string;
  /** The currently-active value of the compared slot (null/undefined = none). */
  current: T | null | undefined;
  /** The incoming intent's value for the compared slot. */
  incoming: T;
}): boolean {
  return (
    args.source === "user" &&
    args.activeDocViewer != null &&
    args.activeDocViewer.documentId === args.documentId &&
    args.current != null &&
    JSON.stringify(args.current) === JSON.stringify(args.incoming)
  );
}
