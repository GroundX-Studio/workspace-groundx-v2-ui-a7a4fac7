import { describe, expect, it } from "vitest";

import { TurnEventBuffer } from "./turnEventBuffer.js";

/**
 * chat-response-streaming P1.2 — the per-turn event buffer is the heart of
 * resume + backpressure: it stamps a monotonic `seq`, lets a (re)connecting
 * reader REPLAY from a given seq then follow live events until the turn is done,
 * and is BOUNDED — on overflow it drops the OLDEST `token` events but never
 * meta/activity/envelope/error. RED until the buffer lands.
 */
describe("TurnEventBuffer", () => {
  it("stamps monotonic seq and replays everything from 0", async () => {
    const buf = new TurnEventBuffer();
    buf.append("meta", { turnKey: "k" });
    buf.append("token", { delta: "Hi" });
    buf.append("envelope", { body: "done" });
    buf.markDone();

    const seen = [];
    for await (const f of buf.read(0)) seen.push(f);
    expect(seen.map((f) => f.seq)).toEqual([1, 2, 3]);
    expect(seen.map((f) => f.type)).toEqual(["meta", "token", "envelope"]);
  });

  it("replays ONLY events after the given seq (resume from Last-Event-ID)", async () => {
    const buf = new TurnEventBuffer();
    buf.append("meta", {});
    buf.append("token", { delta: "a" });
    buf.append("token", { delta: "b" });
    buf.markDone();

    const seen = [];
    for await (const f of buf.read(2)) seen.push(f); // resume after seq 2
    expect(seen.map((f) => f.seq)).toEqual([3]);
  });

  it("replays buffered, then yields LIVE events, then ends when done", async () => {
    const buf = new TurnEventBuffer();
    buf.append("meta", { turnKey: "k" });
    const gen = buf.read(0);

    expect((await gen.next()).value).toMatchObject({ seq: 1, type: "meta" });
    buf.append("token", { delta: "live" });
    expect((await gen.next()).value).toMatchObject({ seq: 2, type: "token", data: { delta: "live" } });
    buf.append("envelope", { body: "x" });
    buf.markDone();
    expect((await gen.next()).value).toMatchObject({ seq: 3, type: "envelope" });
    expect((await gen.next()).done).toBe(true);
  });

  it("drops OLDEST token events on overflow but keeps meta/activity/envelope", async () => {
    const buf = new TurnEventBuffer({ maxEvents: 4 });
    buf.append("meta", {}); // seq 1
    buf.append("token", { delta: "1" }); // seq 2  (oldest token)
    buf.append("token", { delta: "2" }); // seq 3
    buf.append("activity", { name: "search_documents" }); // seq 4
    buf.append("token", { delta: "3" }); // seq 5 → over cap → drop oldest token (seq 2)
    buf.append("envelope", {}); // seq 6 → over cap → drop oldest token (seq 3)
    buf.markDone();

    const seen = [];
    for await (const f of buf.read(0)) seen.push(f);
    // meta, activity, the newest token, and envelope survive; the two oldest tokens are gone.
    expect(seen.map((f) => `${f.seq}:${f.type}`)).toEqual(["1:meta", "4:activity", "5:token", "6:envelope"]);
  });

  it("supports two independent readers from different resume points", async () => {
    const buf = new TurnEventBuffer();
    buf.append("meta", {});
    buf.append("token", { delta: "a" });
    buf.append("envelope", {});
    buf.markDone();

    const fromStart = [];
    for await (const f of buf.read(0)) fromStart.push(f.seq);
    const fromMid = [];
    for await (const f of buf.read(1)) fromMid.push(f.seq);
    expect(fromStart).toEqual([1, 2, 3]);
    expect(fromMid).toEqual([2, 3]);
  });
});
