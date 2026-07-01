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
 * chat-QA — shared brevity framing. Both the grounded prompt's "confirm your
 * navigation in the same turn" instruction and the tool-only answer-repair
 * builder want the same thing: a short, human reply that trusts the model to
 * self-regulate length (a busy person, not a word count). Single source so the
 * two never drift.
 */
export const BUSY_PERSON_BREVITY =
  "succinct and in plain English, written for a busy person — a line or two, " +
  "and only the single most useful fact if one genuinely helps. Don't restate " +
  "the snippets, list fields, or write a long answer";

/**
 * chat-QA — the ANSWER-FORCING instruction (the case where the model called
 * server tools up to the loop cap without ever writing prose, so it must be
 * asked to actually answer). Appended to the transcript before a tools-OFF
 * dispatch (the loop reuses its own `dispatch`, no separate repair builder), so
 * the model MUST write an answer instead of calling another tool. Lives here,
 * not inlined at the call site, so the prompts-module convention + guard hold.
 * `selectedActions` names the calls the model already made, for context.
 *
 * This owes the user a COMPLETE answer, not a one-liner — do NOT reuse
 * `BUSY_PERSON_BREVITY` here (that framing is for a navigation confirmation, a
 * different case; reusing it once starved this answer to a terse fragment).
 */
export function forceAnswerAfterToolsInstruction(selectedActions: string): string {
  return (
    "Your previous response selected UI action(s) but did not include an answer. " +
    `Selected action(s): ${selectedActions}. ` +
    "Do not call tools now — answer the user's question directly and completely, " +
    "in plain English, using the snippets, extracted fields, tool results, and " +
    "workspace context above."
  );
}

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
    "confidence — cite anyway rather than omitting.\n\n" +
    "INLINE MARKERS — in addition to the block, place an inline `[N]` marker in " +
    "your answer prose immediately after each cited claim, where N is that " +
    "citation's 1-based position in the `citations` array (the first entry is " +
    "`[1]`). Put the marker right after the claim its `answerSpan` quotes. Cite at " +
    "the claim or group level — one marker per claim or grouped figure, NOT one " +
    "per individual value — so a list answer stays readable. Markers are the only " +
    "citation text in the prose: never write the words 'citation' or 'source'.\n\n"
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
