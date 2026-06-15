/**
 * chat-response-streaming P1.2 — the TurnRunner + TurnRegistry.
 *
 * A `TurnRunner` owns ONE chat turn's generation, DECOUPLED from any HTTP
 * connection: generation starts immediately and runs to completion regardless of
 * whether a client is attached (a disconnect never aborts it). It sets the ambient
 * `turnStreamContext` sink so deep code (`callGroundedLlm`) emits live `token` /
 * `activity` frames, brackets them with `meta` … `envelope` (or `error`), and lets
 * any number of connection pumps subscribe to its `buffer`. Persistence is the
 * `generate` thunk's job (the existing `handleChatMessage` write) — the runner never
 * persists, so there is exactly ONE write per turn.
 *
 * The `TurnRegistry` keys runners by `(sessionId, turnKey)` — a CLIENT-supplied
 * idempotency key. A re-POST with a known key ATTACHES to the running turn instead
 * of starting a duplicate generation; the key includes `sessionId`, so one session
 * can never reach another's runner (cross-session resume is structurally impossible).
 */
import { ChatHandlerError, type HandleChatMessageResponse } from "./chatHandler.js";
import { TurnEventBuffer } from "./turnEventBuffer.js";
import { turnStreamContext, type TurnStreamSink } from "./streamSink.js";

/** How long a completed runner is retained for late reconnect/replay before eviction. */
const RETAIN_AFTER_DONE_MS = 60_000;

export class TurnRunner {
  readonly sessionId: string;
  readonly turnKey: string;
  readonly buffer = new TurnEventBuffer();

  private readonly streaming: boolean;
  private readonly _completion: Promise<HandleChatMessageResponse | null>;
  private _result: HandleChatMessageResponse | null = null;
  private _error: unknown = null;

  constructor(args: {
    sessionId: string;
    turnKey: string;
    generate: () => Promise<HandleChatMessageResponse>;
    /**
     * Whether to stream the UPSTREAM completion + buffer live token/activity
     * frames. The SSE branch passes true; the JSON branch passes false so its
     * upstream LLM call stays byte-identical to today (no `stream:true`). Both
     * still run through this one runner (one generation, one persist).
     */
    streaming?: boolean;
  }) {
    this.sessionId = args.sessionId;
    this.turnKey = args.turnKey;
    this.streaming = args.streaming ?? false;
    // Detached: start generation now; the connection (if any) attaches via `buffer`.
    this._completion = this.run(args.generate);
  }

  /** Resolves when generation finished (envelope or error already buffered). */
  get completion(): Promise<HandleChatMessageResponse | null> {
    return this._completion;
  }

  /** The assembled response (for the JSON branch); null until done / on error. */
  get result(): HandleChatMessageResponse | null {
    return this._result;
  }

  /** The thrown error (for the JSON branch to map to an HTTP status); null otherwise. */
  get error(): unknown {
    return this._error;
  }

  private async run(generate: () => Promise<HandleChatMessageResponse>): Promise<HandleChatMessageResponse | null> {
    this.buffer.append("meta", { turnKey: this.turnKey });
    // Only the streaming branch wires live callbacks: with them set, callGroundedLlm
    // streams the upstream completion; without (JSON), the upstream call is unchanged.
    const sink: TurnStreamSink = this.streaming
      ? {
          onToken: (delta) => this.buffer.append("token", { delta }),
          onActivity: (activity) => this.buffer.append("activity", activity),
        }
      : {};
    try {
      // The ambient sink is in scope for the whole generation, so callGroundedLlm
      // (5 layers down) streams without any threaded parameter.
      const result = await turnStreamContext.run(sink, () => generate());
      this._result = result;
      // The `envelope` carries the SAME object the JSON branch returns (res.json) —
      // exact parity between the streaming and non-streaming payloads.
      this.buffer.append("envelope", result);
      this.buffer.markDone();
      return result;
    } catch (err) {
      this._error = err;
      const code = err instanceof ChatHandlerError ? err.message : "internal_error";
      this.buffer.append("error", { code });
      this.buffer.markDone();
      return null;
    }
  }
}

export class TurnRegistry {
  private readonly runners = new Map<string, TurnRunner>();

  private key(sessionId: string, turnKey: string): string {
    return `${sessionId}::${turnKey}`;
  }

  /** Attach to a running turn for this (session, key), or start one. Idempotent. */
  getOrCreate(sessionId: string, turnKey: string, factory: () => TurnRunner): TurnRunner {
    const k = this.key(sessionId, turnKey);
    const existing = this.runners.get(k);
    if (existing) return existing;
    const runner = factory();
    this.runners.set(k, runner);
    // Retain after completion for late reconnect/replay, then evict (P2.2 will tune
    // the TTL); a reconnect past eviction falls back to the persisted final message.
    void runner.completion.finally(() => {
      setTimeout(() => {
        if (this.runners.get(k) === runner) this.runners.delete(k);
      }, RETAIN_AFTER_DONE_MS).unref?.();
    });
    return runner;
  }

  /** Look up a running turn (session-scoped — cannot reach another session's). */
  get(sessionId: string, turnKey: string): TurnRunner | undefined {
    return this.runners.get(this.key(sessionId, turnKey));
  }
}
