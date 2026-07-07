/**
 * chat-response-streaming P1.2 — per-turn event buffer.
 *
 * The TurnRunner APPENDS seq-stamped frames here; one or more connection PUMPs
 * READ from it. A reader replays everything after a given seq (resume from
 * `Last-Event-ID`) then follows live frames until the turn is `done`. The buffer
 * is BOUNDED: on overflow it drops the OLDEST `token` frames (cheap prose that a
 * caught-up reader has already seen) but NEVER meta/activity/envelope/error. A
 * reader that resumes from before the dropped window therefore sees a NON-CONTIGUOUS
 * token stream (a gap in streamed prose) — cosmetic only: the never-dropped terminal
 * `envelope` carries the full final answer, so the visible result self-heals on its
 * arrival (and a reader whose runner was evicted entirely resumes from the persisted
 * message, handled one layer up). Generation only ever appends here, so a slow/absent
 * reader never stalls it (socket backpressure lives in the pump).
 */
export type StreamFrameType = "meta" | "activity" | "thinking" | "token" | "envelope" | "error";

export interface StreamFrame {
  seq: number;
  type: StreamFrameType;
  data: unknown;
}

export class TurnEventBuffer {
  private readonly maxEvents: number;
  private readonly store: StreamFrame[] = [];
  private seq = 0;
  private _done = false;
  private waiters: Array<() => void> = [];

  constructor(opts?: { maxEvents?: number }) {
    this.maxEvents = opts?.maxEvents ?? 1000;
  }

  get done(): boolean {
    return this._done;
  }

  /** Highest seq assigned so far (a fresh reconnect with no Last-Event-ID uses 0). */
  get lastSeq(): number {
    return this.seq;
  }

  append(type: StreamFrameType, data: unknown): StreamFrame {
    const frame: StreamFrame = { seq: ++this.seq, type, data };
    this.store.push(frame);
    this.evict();
    this.notify();
    return frame;
  }

  /** Terminal: no more frames will be appended. Wakes readers so they end. */
  markDone(): void {
    this._done = true;
    this.notify();
  }

  /** Drop the OLDEST `token` frames until within cap (keep structural frames). */
  private evict(): void {
    while (this.store.length > this.maxEvents) {
      const idx = this.store.findIndex((f) => f.type === "token");
      if (idx === -1) break; // nothing droppable — keep (structural frames only)
      this.store.splice(idx, 1);
    }
  }

  private notify(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /**
   * Replay frames with `seq > afterSeq`, then yield live frames as they arrive,
   * ending when the turn is done. A waiter is registered BEFORE draining each
   * round so an append during a yield can't be lost (no missed wakeup).
   */
  async *read(afterSeq: number): AsyncGenerator<StreamFrame> {
    let last = afterSeq;
    while (true) {
      const wait = this._done ? null : this.wait();
      for (const f of this.store.filter((x) => x.seq > last)) {
        yield f;
        last = f.seq;
      }
      if (this._done) {
        // Drain anything appended while we were yielding, then finish.
        for (const f of this.store.filter((x) => x.seq > last)) {
          yield f;
          last = f.seq;
        }
        return;
      }
      await wait;
    }
  }
}
