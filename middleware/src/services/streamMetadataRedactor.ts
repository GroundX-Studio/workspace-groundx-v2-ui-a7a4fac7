/**
 * chat-response-streaming / citation-stream-leak.
 *
 * The grounded model appends a trailing metadata block to its answer — a
 * ```json {"citations":[...]} fence (`fragments.ts` citationsContract), or, when
 * it drops the fence, a bare {"citations":...} object. `parseGroundedAnswer`
 * strips that block from the FINAL answer, but the STREAMED token frames are raw
 * model text, so the block (including the internal GroundX documentId) briefly
 * renders mid-stream before the final envelope replaces the draft.
 *
 * This factory returns a stateful redactor for the token seam (`turnRunner`):
 * feed it each raw delta, it returns the substring safe to stream.
 *
 * Approach — tell the citations block apart from ORDINARY code by its KEY, so
 * legitimate ```json examples (common for a product assistant that explains
 * APIs / extraction payloads) still stream normally:
 *   - Hit a ```json fence → BUFFER it (show nothing yet) only until the block's
 *     first object key is readable. If that key is a metadata key (`citations`
 *     etc.) → suppress the block for the rest of the turn. If it's anything else
 *     (or the body isn't a `{"key"` object) → it's content: RELEASE everything
 *     held and resume normal streaming. A content block is therefore held for
 *     only ~a dozen characters, then streams live.
 *   - A BARE {"citations" object (fence dropped) → suppress from it. This match
 *     is narrow (a brace opening straight onto a metadata key), so ordinary prose
 *     braces and content objects like {"amount":5} stream freely.
 *
 * Over-holding is SAFE: the final envelope carries the fully fence-stripped body
 * and REPLACES the streamed draft (`useConversation` finalize), so anything held
 * is never lost — it lands with the final message.
 */

/**
 * The keys that mark a trailing block as MODEL METADATA (not user-facing prose),
 * shared with `parseGroundedAnswer` (the final-answer stripper) so the two
 * detectors — one streaming/incremental, one on the completed answer — can never
 * disagree about what counts as a metadata block. `citations` is the live key;
 * `suggestedIntent`/`proposedSchemaField` are retired but still stripped.
 */
export const METADATA_BLOCK_KEYS = ["citations", "suggestedIntent", "proposedSchemaField"] as const;

/** Does a PARSED JSON object open a metadata block (has a metadata key)? */
export function isMetadataBlockObject(block: Record<string, unknown>): boolean {
  return METADATA_BLOCK_KEYS.some((k) => k in block);
}

const META_KEYS = METADATA_BLOCK_KEYS;

// A ```json fence opening (content OR metadata — classified afterwards).
const FENCE_RE = /```[ \t]*json/i;
// A BARE object opening straight onto a metadata key (fence-dropped fallback).
// Deliberately narrow: {"amount":5} and prose braces do NOT match.
const BARE_META_RE = new RegExp("[{]\\s*\"(?:" + META_KEYS.join("|") + ")\"");

// Hold back a trailing window at least as long as the longest bare marker so one
// split across deltas is caught before any of it is emitted. `{"proposedSchema-
// Field"` is 22 chars; 24 covers it. (Fenced blocks are held wholesale while
// buffering, so they don't rely on this window.)
const HOLDBACK = 24;
// Safety valve: if a buffered fenced block hasn't revealed a first key within
// this many chars (pathological), treat it as content and release it.
const CLASSIFY_LIMIT = 200;

export type FenceVerdict = "metadata" | "content" | "undecided";

/**
 * Classify the text that FOLLOWS a ```json fence. `metadata` iff it opens an
 * object whose FIRST key is a metadata key (the citations-block shape). `content`
 * as soon as we know it can't be that — a non-object, an empty object, or a first
 * key that has diverged from every metadata key. `undecided` while the opening
 * (whitespace / `{` / a still-viable key prefix) is still streaming.
 */
export function classifyFenceBody(body: string): FenceVerdict {
  const s = body.replace(/^\s+/, "");
  if (s === "") return "undecided"; // nothing after the fence yet
  if (s[0] !== "{") return "content"; // array / scalar / prose — not a metadata object
  const afterBrace = s.slice(1).replace(/^\s+/, "");
  if (afterBrace === "") return "undecided";
  if (afterBrace[0] !== '"') return "content"; // {} or {123 … — no quoted key
  const rest = afterBrace.slice(1); // key characters (until the closing quote)
  const close = rest.indexOf('"');
  if (close === -1) {
    // Key still streaming — hold only while it can still BECOME a metadata key.
    return META_KEYS.some((k) => k.startsWith(rest)) ? "undecided" : "content";
  }
  return (META_KEYS as readonly string[]).includes(rest.slice(0, close)) ? "metadata" : "content";
}

/**
 * Stateful per-turn redactor. Call with each raw content delta; returns the
 * (possibly empty, possibly shorter) text safe to stream to the UI.
 */
export function makeMetadataStreamRedactor(): (delta: string) => string {
  let full = "";
  let emitted = 0;
  let mode: "normal" | "buffering" | "suppressing" = "normal";
  let bodyStart = 0; // index just past the ```json fence, while buffering

  return (delta: string): string => {
    full += delta;
    if (mode === "suppressing") return "";

    if (mode === "buffering") {
      const verdict = classifyFenceBody(full.slice(bodyStart));
      if (verdict === "metadata") {
        mode = "suppressing";
        emitted = full.length;
        return "";
      }
      if (verdict === "content" || full.length - bodyStart > CLASSIFY_LIMIT) {
        // Ordinary code block — release everything held (fence + body) and resume.
        const out = full.slice(emitted);
        emitted = full.length;
        mode = "normal";
        return out;
      }
      return ""; // undecided — keep holding
    }

    // mode === "normal": look for the earliest marker in the not-yet-emitted region.
    const region = full.slice(emitted);
    const fenceM = FENCE_RE.exec(region);
    const bareM = BARE_META_RE.exec(region);
    const fenceIdx = fenceM ? emitted + fenceM.index : Infinity;
    const bareIdx = bareM ? emitted + bareM.index : Infinity;

    if (bareIdx < fenceIdx) {
      // Bare metadata object → emit up to it, then suppress the rest of the turn.
      const out = full.slice(emitted, bareIdx);
      emitted = full.length;
      mode = "suppressing";
      return out;
    }

    if (fenceIdx !== Infinity) {
      // ```json fence → emit the prose before it, then buffer + classify the body.
      const prose = full.slice(emitted, fenceIdx);
      emitted = fenceIdx; // the fence itself is held, not yet emitted
      bodyStart = fenceIdx + fenceM![0].length;
      mode = "buffering";
      const verdict = classifyFenceBody(full.slice(bodyStart));
      if (verdict === "metadata") {
        mode = "suppressing";
        emitted = full.length;
        return prose;
      }
      if (verdict === "content" || full.length - bodyStart > CLASSIFY_LIMIT) {
        const held = full.slice(emitted); // fence + body so far
        emitted = full.length;
        mode = "normal";
        return prose + held;
      }
      return prose; // undecided — hold the fence + body
    }

    // No marker — stream everything except a bounded trailing window that might be
    // a marker forming, and only hold that window when it actually contains a
    // potential start (a backtick or `{`); otherwise brace-free prose has no lag.
    const tailStart = Math.max(emitted, full.length - HOLDBACK);
    const tail = full.slice(tailStart);
    const boundary = tail.includes("`") || tail.includes("{") ? tailStart : full.length;
    const out = full.slice(emitted, boundary);
    emitted = boundary;
    return out;
  };
}
