import { describe, expect, it } from "vitest";

import { pumpFramesToResponse, type SseWriter } from "./streamPump.js";
import { TurnEventBuffer } from "./turnEventBuffer.js";

/**
 * chat-response-streaming P2.3 — the connection pump drains a runner's buffer to
 * an SSE socket: replays from Last-Event-ID, emits a periodic HEARTBEAT comment
 * while idle (so an ALB/nginx idle timeout can't kill a long stream), honors
 * socket backpressure (awaits drain when write() returns false), and ends the
 * response when the turn is done. RED until the pump lands.
 */
function fakeWriter() {
  const writes: string[] = [];
  let ended = false;
  let drainResolvers: Array<() => void> = [];
  const writer: SseWriter & { writes: string[]; flushDrain: () => void; failNextWrite: () => void } = {
    writes,
    _fail: false,
    write(chunk: string) {
      writes.push(chunk);
      if (this._fail) {
        this._fail = false;
        return false; // signal backpressure once
      }
      return true;
    },
    end() {
      ended = true;
    },
    get writableEnded() {
      return ended;
    },
    onceDrain() {
      return new Promise<void>((resolve) => drainResolvers.push(resolve));
    },
    flushDrain() {
      const r = drainResolvers;
      drainResolvers = [];
      for (const resolve of r) resolve();
    },
    failNextWrite() {
      this._fail = true;
    },
  } as never;
  return writer;
}

describe("pumpFramesToResponse", () => {
  it("replays from Last-Event-ID, emits a heartbeat while idle, then ends when done", async () => {
    const buffer = new TurnEventBuffer();
    const writer = fakeWriter();
    buffer.append("meta", { turnKey: "k" }); // seq 1
    buffer.append("token", { delta: "hi" }); // seq 2

    const pump = pumpFramesToResponse(buffer, writer, { lastEventId: 1, heartbeatMs: 10 });
    // Idle past a heartbeat tick before the turn finishes.
    await new Promise((r) => setTimeout(r, 25));
    buffer.append("envelope", { ok: true }); // seq 3
    buffer.markDone();
    await pump;

    // Resumed AFTER seq 1 → no meta frame; token + envelope present.
    expect(writer.writes.some((w) => w.includes("event: meta"))).toBe(false);
    expect(writer.writes.some((w) => w.includes("id: 2\nevent: token"))).toBe(true);
    expect(writer.writes.some((w) => w.includes("event: envelope"))).toBe(true);
    // A heartbeat comment was emitted during the idle window.
    expect(writer.writes.some((w) => w.startsWith(":"))).toBe(true);
    expect(writer.writableEnded).toBe(true);
  });

  it("stops pumping when the socket reports closed (writableEnded) mid-stream", async () => {
    // Abrupt client disconnect: after the first write the socket is closed; the pump
    // must stop on the next frame (not keep writing to a dead socket / hang).
    const buffer = new TurnEventBuffer();
    buffer.append("token", { delta: "a" }); // seq 1
    let closed = false;
    const writes: string[] = [];
    const writer: SseWriter = {
      write(chunk: string) {
        writes.push(chunk);
        closed = true; // socket dies right after the first write
        return true;
      },
      end() {},
      get writableEnded() {
        return closed;
      },
      onceDrain: async () => {},
    };

    const pump = pumpFramesToResponse(buffer, writer, { lastEventId: 0, heartbeatMs: 0 });
    buffer.append("token", { delta: "b" }); // seq 2 — must NOT be written
    buffer.append("envelope", {});
    buffer.markDone();
    await pump; // resolves (does not hang) despite the closed socket

    expect(writes.filter((w) => w.includes("event:")).length).toBe(1);
  });

  it("awaits drain when a write reports backpressure", async () => {
    const buffer = new TurnEventBuffer();
    const writer = fakeWriter();
    buffer.append("token", { delta: "a" });
    buffer.append("envelope", {});
    buffer.markDone();
    writer.failNextWrite(); // first write returns false → pump must await drain

    const pump = pumpFramesToResponse(buffer, writer, { lastEventId: 0, heartbeatMs: 0 });
    // The pump is parked on onceDrain after the first (backpressured) write.
    await new Promise((r) => setTimeout(r, 5));
    expect(writer.writableEnded).toBe(false); // not finished — waiting for drain
    writer.flushDrain();
    await pump;
    expect(writer.writableEnded).toBe(true);
    expect(writer.writes.some((w) => w.includes("event: envelope"))).toBe(true);
  });
});
