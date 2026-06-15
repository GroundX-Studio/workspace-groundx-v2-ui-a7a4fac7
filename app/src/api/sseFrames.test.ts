import { describe, expect, it } from "vitest";

import { readSseFrames } from "@/api/sseFrames";

/**
 * chat-response-streaming — the client SSE frame reader. These were MISSING (the
 * gap that let the reconnect parser ship with a truncated-frame defect): the only
 * coverage was indirect, always feeding clean whole frames in one chunk. Cover the
 * robustness contract directly: split-across-reads, heartbeats, CRLF reframing, and
 * — critically — a truncated trailing frame on a mid-stream drop must NOT be emitted.
 */
function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ch of chunks) controller.enqueue(enc.encode(ch));
      controller.close();
    },
  });
}
async function collect(body: ReadableStream<Uint8Array>) {
  const out = [];
  for await (const f of readSseFrames(body)) out.push(f);
  return out;
}

describe("readSseFrames", () => {
  it("parses whole \\n\\n-terminated frames", async () => {
    const frames = await collect(
      streamOf(`id: 1\nevent: meta\ndata: {"turnKey":"k"}\n\n`, `id: 2\nevent: token\ndata: {"delta":"hi"}\n\n`),
    );
    expect(frames).toEqual([
      { seq: 1, event: "meta", data: '{"turnKey":"k"}' },
      { seq: 2, event: "token", data: '{"delta":"hi"}' },
    ]);
  });

  it("reassembles a frame split mid-line across read chunks", async () => {
    const frames = await collect(streamOf(`id: 1\nevent: tok`, `en\ndata: {"delta":"sp`, `lit"}\n\n`));
    expect(frames).toEqual([{ seq: 1, event: "token", data: '{"delta":"split"}' }]);
  });

  it("skips heartbeat comment lines", async () => {
    const frames = await collect(streamOf(`: keep-alive\n\n`, `event: token\ndata: x\n\n`));
    expect(frames.map((f) => f.event)).toEqual(["token"]);
  });

  it("DISCARDS a truncated trailing frame (no phantom on a mid-stream drop)", async () => {
    // The stream drops mid-envelope — the trailing block never gets its blank-line
    // terminator. It must NOT be force-parsed into a malformed frame.
    const frames = await collect(
      streamOf(`id: 1\nevent: token\ndata: {"delta":"ok"}\n\n`, `id: 2\nevent: envelope\ndata: {"reply":{"ans`),
    );
    expect(frames).toEqual([{ seq: 1, event: "token", data: '{"delta":"ok"}' }]);
  });

  it("handles CRLF framing from a reframing proxy", async () => {
    const frames = await collect(streamOf(`id: 1\r\nevent: token\r\ndata: {"delta":"x"}\r\n\r\n`));
    expect(frames).toEqual([{ seq: 1, event: "token", data: '{"delta":"x"}' }]);
  });

  it("handles a CRLF terminator SPLIT across two read chunks", async () => {
    // The \r\n\r\n terminator is split so a single \r\n straddles the read boundary
    // (\r ends chunk 1, \n starts chunk 2). A per-chunk CRLF normalize would miss
    // this — the boundary must still collapse to \n\n and the frame must emit.
    const frames = await collect(
      streamOf(`id: 1\r\nevent: token\r\ndata: {"delta":"x"}\r\n\r`, `\nid: 2\r\nevent: token\r\ndata: {"delta":"y"}\r\n\r\n`),
    );
    expect(frames).toEqual([
      { seq: 1, event: "token", data: '{"delta":"x"}' },
      { seq: 2, event: "token", data: '{"delta":"y"}' },
    ]);
  });

  it("cancels the body when the consumer abandons the stream early", async () => {
    // A thrown/early-broken consumer (e.g. streamChatMessage rejecting on an error or
    // malformed frame) must release the connection — not leak the open socket to GC.
    let cancelled = false;
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(enc.encode(`event: token\ndata: a\n\n`));
        controller.enqueue(enc.encode(`event: token\ndata: b\n\n`));
        // deliberately never close — simulate an open connection the consumer abandons
      },
      cancel() {
        cancelled = true;
      },
    });
    const gen = readSseFrames(stream);
    const first = await gen.next();
    expect(first.value).toMatchObject({ event: "token", data: "a" });
    await gen.return(undefined); // consumer abandons (break / throw)
    expect(cancelled).toBe(true);
  });
});
