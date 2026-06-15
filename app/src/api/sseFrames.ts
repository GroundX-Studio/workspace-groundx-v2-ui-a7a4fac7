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
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const frame = parseBlock(block);
      if (frame) yield frame;
    }
    if (done) {
      if (buffer.trim().length > 0) {
        const frame = parseBlock(buffer);
        if (frame) yield frame;
      }
      return;
    }
  }
}
