/**
 * Shared model-facing prompt fragments (chat-architecture-hardening Task 2).
 *
 * Single source for text that appears in MORE than one prompt. A fragment
 * here is the normative copy — consumers compose, never re-type. The
 * prompt-literal drift guard (`promptLiterals.guard.test.ts`) enforces that
 * no prompt literal lives outside this directory.
 */

/**
 * The VOICE rule — bans internal materials/mechanics vocabulary from
 * user-visible answers. Extracted from the grounded prompt (2026-06-11
 * natural-voice fix); Task 3 folded in the deleted hybrid prompt's extra
 * ban term ('structured context') — this list is the union of both
 * pre-merge copies and is the NORMATIVE ban-list (the spec's list is
 * illustrative).
 *
 * Context for the rule: the model was narrating its inputs to users
 * ("From the GroundX docs I have here…", "The snippets don't say…").
 * The materials in the prompt are PRIVATE context, never a quotable
 * source. Speak as the assistant, about the user's documents.
 */
export const VOICE_RULE =
  "VOICE: never expose your internal materials or mechanics to the user. " +
  "Words like 'snippets', 'extracted fields', 'the docs/guidance I have', " +
  "'skill pack', 'sections', 'context', 'structured context', 'system " +
  "prompt', or 'tools' must " +
  "not appear in your answers. Refer to the user's content as 'this " +
  "document' / 'this bill' / 'your documents'. When you lack grounding, " +
  "say \"I don't see that in this document\" — never \"the snippets " +
  "don't say\". Just answer naturally, as someone who read the document " +
  "and knows the product.\n\n";

/**
 * The merged citations output contract (harden-citation-emission U1) — ONE
 * builder, ONE example fence; the extraction-form entry appears iff the
 * EXTRACTED FIELDS block does. Citation of content claims is REQUIRED (the
 * live model omitted the permissive "MAY" block on ~60% of content turns,
 * 2026-06-12); the skip license is scoped to non-content turns. Verification
 * outcomes are framed as confidence tiers, never as threats of dropping —
 * threat language incentivized omission. (Citations are metadata on the
 * answer, not a tool surface — see the A.3 note in `grounded.ts`.)
 */
export function citationsContract(hasExtraction: boolean): string {
  const quoteEntry =
    '{"documentId":"<id-from-the-snippet-header>","page":<int>,"quote":"<verbatim phrase copied from the snippet>","answerSpan":"<the claim in your answer it supports>"}';
  const fieldEntry =
    '{"documentId":"<id>","field":"<path in EXTRACTED FIELDS>","value":"<verbatim field value>","answerSpan":"<the claim it supports>"}';
  return (
    "CITATIONS — required for content answers. If your answer states ANY " +
    "fact drawn from the snippets" +
    (hasExtraction ? " or the EXTRACTED FIELDS block" : "") +
    ", you MUST end the answer with a single fenced JSON block carrying " +
    "`citations` — one entry per content claim. Omit the block ONLY when " +
    "the answer draws on " +
    (hasExtraction ? "neither" : "no snippet") +
    " (greetings, small talk, product questions).\n\n" +
    "```json\n" +
    '{"citations":[' +
    quoteEntry +
    (hasExtraction ? "," + fieldEntry : "") +
    "]}\n" +
    "```\n\n" +
    "Use the `quote` entry for claims grounded in a snippet: `quote` MUST " +
    "be copied VERBATIM from that snippet (it is the proof the claim is grounded) " +
    "and reference only documentIds present in the snippet headers. " +
    (hasExtraction
      ? "Use the `field` entry for claims grounded in the EXTRACTED FIELDS " +
        "block: `field` is the exact path inside that JSON (e.g. " +
        '"meters[0].meter_number") and `value` is that field\'s value ' +
        "copied VERBATIM. Cite only fields that actually appear in the " +
        "block — fabricated paths cannot be verified — and never cite the " +
        "`_truncated` marker. Both entry forms go in the ONE `citations` " +
        "array of the SAME single block — never a second block. "
      : "") +
    "`answerSpan` is the exact phrase from YOUR answer the entry supports. " +
    "Entries that don't match the source verbatim are shown with lower " +
    "confidence — cite anyway rather than omitting.\n\n"
  );
}

/**
 * The shared snippet-header line — `[n] file="…" doc=… page=…`. The SAME
 * format feeds the grounded snippet block and the field-extractor prompt;
 * the grounded citations contract tells the model to reference the
 * documentIds it carries, and both parsers validate against them.
 */
export function snippetHeader(
  s: { documentId: string; pageNumber?: number; fileName?: string },
  i: number,
): string {
  return s.fileName
    ? `[${i + 1}] file="${s.fileName}" doc=${s.documentId} page=${s.pageNumber ?? "?"}`
    : `[${i + 1}] doc=${s.documentId} page=${s.pageNumber ?? "?"}`;
}
