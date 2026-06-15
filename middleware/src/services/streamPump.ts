/**
 * chat-response-streaming P2.3 — the connection PUMP: drains one TurnRunner's
 * event buffer to an SSE socket.
 *
 * - Replays from `lastEventId` (resume), then follows live frames until the turn
 *   is done.
 * - Emits a periodic HEARTBEAT comment (`:\n\n`) while idle, so an ALB/nginx idle
 *   timeout can't kill a long-running stream.
 * - Honors SOCKET backpressure: when `write()` returns false it awaits drain. This
 *   throttles only THIS connection — the runner only ever appends to its bounded
 *   buffer (drop-oldest-token), so a slow reader never stalls generation.
 * - Ends the response when the turn completes (or the socket is already closed).
 *
 * Decoupled from Express for testability: the route adapts `res` to `SseWriter`.
 */
import type { EventEmitter } from "node:events";

import type { TurnEventBuffer } from "./turnEventBuffer.js";

/**
 * Resolve when a backpressured socket DRAINS — or when it CLOSES or ERRORS. The
 * route adapts this into `SseWriter.onceDrain`. The `close`/`error` arms are the
 * crucial part: a client that disconnects GRACEFULLY (a clean FIN) emits `close`
 * but neither `drain` nor `error`, so waiting on `drain` alone would hang the pump
 * forever (leaking its heartbeat timer + buffer subscription). Resolving on any of
 * the three lets the pump loop back to its `writableEnded` check and end cleanly.
 * All three listeners are removed once one fires, so a long stream never accretes
 * listeners; the `error` listener also prevents an unhandled-`error` crash while we
 * wait. The waiter never REJECTS — it just stops waiting.
 */
export function onceDrainOrClose(res: EventEmitter): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = () => {
      res.off("drain", done);
      res.off("close", done);
      res.off("error", done);
      resolve();
    };
    res.once("drain", done);
    res.once("close", done);
    res.once("error", done);
  });
}

export interface SseWriter {
  /** Write a chunk; returns false when the socket buffer is full (backpressure). */
  write(chunk: string): boolean;
  /** End the response. */
  end(): void;
  /** True once the response is finished/closed (stop writing). */
  readonly writableEnded: boolean;
  /** Resolves when the socket has drained after a backpressured write. */
  onceDrain(): Promise<void>;
}

export async function pumpFramesToResponse(
  buffer: TurnEventBuffer,
  writer: SseWriter,
  opts: { lastEventId: number; heartbeatMs: number },
): Promise<void> {
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  if (opts.heartbeatMs > 0) {
    heartbeat = setInterval(() => {
      if (!writer.writableEnded) writer.write(":\n\n");
    }, opts.heartbeatMs);
    // Never keep the process alive for a heartbeat timer.
    heartbeat.unref?.();
  }
  try {
    for await (const frame of buffer.read(opts.lastEventId)) {
      if (writer.writableEnded) break;
      const ok = writer.write(`id: ${frame.seq}\nevent: ${frame.type}\ndata: ${JSON.stringify(frame.data)}\n\n`);
      if (!ok) await writer.onceDrain();
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    if (!writer.writableEnded) writer.end();
  }
}
