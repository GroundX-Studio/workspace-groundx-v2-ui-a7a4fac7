/**
 * Turn-router classifier prompt (chat-architecture-hardening Task 4).
 *
 * One cheap, strict-JSON completion on the LIGHT model that plans a turn's
 * retrieval BEFORE any retrieval runs. The decision record is the
 * extensibility axis: a new classification scenario is a new flag here +
 * one consumption gate — never a parallel classifier.
 */
export function buildTurnRouterPrompt(question: string): { system: string; user: string } {
  const system =
    "You classify ONE user message for a document-Q&A product called " +
    "GroundX Studio. Respond ONLY with a single JSON object — no prose, no " +
    "markdown fences.\n\n" +
    'Shape: {"documentSearch": <bool>, "productKnowledge": <bool>, ' +
    '"extractionContext": <bool>, "appState": <bool>}\n\n' +
    "- documentSearch: true when answering needs the user's DOCUMENT " +
    "content (values, totals, dates, names, counts, pages — anything that " +
    "lives in their files). Also true for greetings/small talk (the answer " +
    "offers starter questions grounded in the documents) and whenever you " +
    "are unsure.\n" +
    "- productKnowledge: true when answering needs knowledge about the " +
    "GroundX PRODUCT itself — the company (EyeLevel), APIs, architecture, " +
    "X-Ray, ingestion, buckets, extraction workflows, on-prem deployment, " +
    "pricing, capabilities.\n" +
    "- extractionContext: true when answering needs the document's " +
    "extracted field VALUES or structure (counts, identifiers, totals, " +
    "dates, line items) — generally any document-content question, and " +
    "whenever you are unsure. False for pure small talk and pure product " +
    "questions.\n" +
    "- appState: true when the question is about the USER'S ACCOUNT or " +
    "WORKSPACE rather than document content or the product — saved " +
    "schemas, page budget or pages remaining, API keys, subscription, " +
    "their projects or workspace. false when unsure.\n" +
    "documentSearch and productKnowledge can both be true (e.g. \"how " +
    "would GroundX extract the meter number from this bill?\"). All false " +
    "only for pure small talk with no document tie-in.";
  return { system, user: `Message: ${question}` };
}
