/**
 * chat-response-streaming P3 — client-side reader for the server's SSE frames.
 *
 * Parses the `id:` / `event:` / `data:` blocks the streaming `POST /api/chat/messages`
 * emits into `{ seq, event, data }` records, robust to frames split across network
 * read boundaries. Heartbeat comment lines (`:`) and dataless blocks are skipped.
 * This is the transport-level reader; `streamChatMessage` maps frames to callbacks.
 */
export interface SseFrame {
  /** The `id:` value (monotonic seq), or null if absent. */
  seq: number | null;
  /** The `event:` name (`meta` | `activity` | `token` | `envelope` | `error`). */
  event: string;
  /** The raw `data:` payload (JSON string for our frames). */
  data: string;
}

function parseBlock(block: string): SseFrame | null {
  let seq: number | null = null;
  let event = "message";
  let data = "";
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // SSE comment / heartbeat
    if (line.startsWith("id:")) {
      const n = Number.parseInt(line.slice(3).trim(), 10);
      seq = Number.isNaN(n) ? null : n;
    } else if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data += (data ? "\n" : "") + line.slice("data:".length).replace(/^ /, "");
    }
  }
  if (data === "") return null; // heartbeat-only / blank block
  return { seq, event, data };
}

export async function* readSseFrames(body: ReadableStream<Uint8Array>): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      // Normalize CRLF framing (a reframing proxy/CDN) to LF on the WHOLE unconsumed
      // buffer — not just this chunk — so a `\r\n` SPLIT across two reads (the `\r`
      // ending one chunk, the `\n` starting the next) still collapses to the `\n\n`
      // event boundary. A per-chunk normalize would strand the lone `\r` and lose the
      // frame. The `\r` guard keeps the common LF-only path (our own server) regex-free.
      if (buffer.indexOf("\r") >= 0) buffer = buffer.replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const frame = parseBlock(block);
        if (frame) yield frame;
      }
      if (done) {
        // Any leftover is an INCOMPLETE frame (a complete SSE event always ends with
        // the blank-line terminator, which the loop above already consumed). On a
        // mid-frame stream drop it must be DISCARDED — never force-parsed into a
        // malformed frame (which would throw downstream / poison Last-Event-ID).
        return;
      }
    }
  } finally {
    // The consumer may abandon us early — `streamChatMessage` rejects on an `error`
    // or malformed frame, or breaks out. Cancel the body so the underlying socket is
    // released instead of leaked until GC. On normal completion the reader is already
    // done, so this is a harmless no-op; swallow any rejection from a double-cancel.
    await reader.cancel().catch(() => {});
  }
}
