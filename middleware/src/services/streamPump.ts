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
import type { TurnEventBuffer } from "./turnEventBuffer.js";

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
