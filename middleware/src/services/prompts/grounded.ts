/**
 * Grounded system-prompt builder (chat-architecture-hardening Task 2).
 *
 * Moved VERBATIM from `ragPipeline.ts#callGroundedLlm` — the assembled
 * string is byte-identical to the pre-move prompt (the VOICE rule and the
 * citations contract now come from `fragments.ts`, whose copies were
 * extracted from this prompt unchanged).
 *
 * Three-mode behavior baked in:
 *
 *   1. Greeting / meta — respond conversationally, name the file(s),
 *      suggest a couple of starter questions. NOT a refusal.
 *   2. In-coverage content question — concise answer using only the
 *      snippets; cite via the fenced JSON block.
 *   3. Out-of-coverage content question — honest acknowledgement +
 *      pointer to what the doc DOES cover. No fabrication, no
 *      general-knowledge fill-in.
 */
import { citationsContract, VOICE_RULE } from "./fragments.js";

export interface GroundedSystemOptions {
  /**
   * RAG + raw extraction (2026-06-11) — the primary document's FULL
   * workflow-extraction output as a JSON string. Search retrieves only the
   * top-K chunks; this block guarantees structured facts (meter numbers,
   * counts, totals) are always in front of the model. Null/omitted →
   * snippets-only prompt (unchanged behavior).
   */
  extraction?: string | null;
  /**
   * GroundX skill knowledge (2026-06-11) — prompt-ready sections retrieved
   * from the vendored groundx-agent-harness skill pack for product/meta
   * questions. Null/omitted → no knowledge block (ordinary document turns).
   * Replaces the retired hard-coded "ABOUT GROUNDX" capsule.
   */
  skillKnowledge?: string | null;
  /**
   * Workspace state (chat-architecture-hardening Task 3) — the hybrid
   * caller's structured app-state block (active entity, onboarding frame,
   * saved counts, recent viewer trail), rendered as private context. The
   * grounded seam's third caller passes this instead of forking the prompt.
   */
  structuredContext?: string | null;
  /**
   * Generated TOOL NOTES section (Task 6) — rendered by
   * `toolNotes.ts#buildToolNotes` from the step-FILTERED catalog's declared
   * guidance. Replaces the former hand-written per-tool paragraphs.
   */
  toolNotes?: string | null;
}

export function buildGroundedSystem(options: GroundedSystemOptions = {}): string {
  const { extraction, skillKnowledge, structuredContext, toolNotes } = options;
  return (
    "You are the user's analyst for the documents in the snippets " +
    "below. You read them on the user's behalf and answer in plain " +
    "English — warm, direct, brief.\n\n" +

    "For content claims, use only what's in the snippets" +
    (extraction ? " and the EXTRACTED FIELDS block" : "") +
    ". Don't invent " +
    "facts and don't fill in from general knowledge. If the snippets " +
    (extraction ? "or extracted fields " : "") +
    "cover the answer, lead with it and quote a short verbatim phrase " +
    "when it helps. If they don't, say so in one sentence and point to " +
    "something the documents do cover.\n\n" +

    VOICE_RULE +

    (extraction
      ? "The EXTRACTED FIELDS block is the document's complete structured " +
        "extraction (every field the workflow pulled from it, including " +
        "arrays like meters/charges). Use it for counting questions " +
        "(\"how many meters?\"), identifier lookups (\"what is the meter " +
        "number?\"), and any field the snippets happen not to include — " +
        "it is authoritative for the document's own values.\n\n"
      : "") +

    // Snippet-rereading nudge (2026-05-28). Observed failure mode: a
    // snippet contains a JSON object whose key directly answers the
    // question (e.g. `"due_date": "2025-07-30"`), and the model still
    // replies "no snippets." Tell it to read the JSON.
    "Snippets may be JSON-shaped (key/value blocks extracted from the " +
    "document). If a JSON field or JSON key in a snippet directly " +
    "answers the question, quote its value verbatim — that IS the " +
    "answer. Do not claim 'no snippets' or 'I can't determine' when " +
    "the JSON field is right there.\n\n" +

    "Greetings, small talk, and meta questions about your capabilities " +
    "aren't content questions — respond conversationally and offer a " +
    "starter question or two grounded in the snippets.\n\n" +

    // GroundX skill knowledge (2026-06-11) — the REAL agent skills (vendored
    // groundx-agent-harness pack), retrieved per question. Replaces the
    // retired hard-coded "ABOUT GROUNDX" capsule: one source of truth.
    (skillKnowledge
      ? "GROUNDX KNOWLEDGE (private background for YOU — answer questions " +
        "about GroundX itself, its APIs, architecture, extraction workflows, " +
        "on-prem deployment, or the company from it, speaking naturally and " +
        "confidently as if you simply know the product. NEVER mention or " +
        "cite this material to the user — no 'from the docs I have', 'the " +
        "guidance here', or 'according to my materials'. Just state the " +
        "facts in your own voice. Document content claims stay grounded in " +
        "the user's documents.):\n" + skillKnowledge + "\n\n"
      : "") +

    // WORKSPACE STATE (chat-architecture-hardening Task 3) — the hybrid
    // caller's app-state block, same private-context framing as the skill
    // knowledge: speak FROM it, never cite it.
    (structuredContext
      ? "WORKSPACE STATE (private context for YOU — the user's current " +
        "position in the app: active sample, onboarding progress, saved " +
        "items, recent navigation. Use it to answer questions about where " +
        "they are and what they can do next, speaking naturally. NEVER " +
        "mention or cite this block to the user.):\n" + structuredContext + "\n\n"
      : "") +

    // widget-llm-integration follow-up A.3 (2026-05-28) — the
    // grounded prompt no longer asks for `proposedSchemaField` or
    // `suggestedIntent` JSON. Both surfaces ship via native LLM
    // function-calling tools now; the chat router validates +
    // routes them to `reply.intents[]` (read) or
    // `reply.suggestedActions[]` (mutate, user-confirmed chip).
    //
    // The fenced ```json block remains the `citations` surface (citations
    // are metadata on the answer, not a tool surface). Merged MUST-cite
    // contract (harden-citation-emission U1): one builder, one example
    // fence; the extraction-form entry appears iff the extraction block does.
    citationsContract(Boolean(extraction)) +

    // Task 6 — per-tool guidance is generated from the step-filtered
    // catalog's own declarations (description + promptGuidance), never
    // hand-written here.
    (toolNotes ?? "")
  );
}
