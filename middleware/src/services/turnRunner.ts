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
import { logger } from "../lib/logger.js";
import { ChatHandlerError, type HandleChatMessageResponse } from "./chatHandler.js";
import { TurnEventBuffer } from "./turnEventBuffer.js";
import { makeMetadataStreamRedactor } from "./streamMetadataRedactor.js";
import { turnStreamContext, type TurnStreamSink } from "./streamSink.js";

/** How long a completed runner is retained for late reconnect/replay before eviction. */
const RETAIN_AFTER_DONE_MS = 60_000;

export class TurnRunner {
  readonly sessionId: string;
  readonly turnKey: string;
  readonly buffer = new TurnEventBuffer();

  private readonly streaming: boolean;
  private readonly controller = new AbortController();
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

  /** True once this turn has finished (envelope or error buffered). */
  get done(): boolean {
    return this.buffer.done;
  }

  /**
   * Supersede-cancel: abort the turn's in-flight upstream LLM call. This is
   * BEST-EFFORT cooperative cancellation — if the upstream call is still in flight,
   * generation throws before it persists and the partial output is discarded; if the
   * call already returned (the abort lost the race), the turn completes and persists
   * its answer, which is a valid reply to a real user message (no inconsistency — that
   * turn's connection also receives the full envelope). Idempotent; a no-op once done.
   */
  abort(): void {
    if (!this.buffer.done) this.controller.abort();
  }

  private async run(generate: () => Promise<HandleChatMessageResponse>): Promise<HandleChatMessageResponse | null> {
    this.buffer.append("meta", { turnKey: this.turnKey });
    // The abort signal is ALWAYS wired (so any turn can be superseded); the live
    // callbacks are streaming-only (JSON keeps its upstream call byte-identical).
    // citation-stream-leak — redact the trailing ```json {"citations":…} metadata
    // block from the streamed tokens so the raw JSON (incl. the internal GroundX
    // documentId) never crosses the wire or flashes mid-stream. The FINAL envelope
    // carries the fence-stripped body and replaces the streamed draft, so holding
    // back the block costs nothing.
    const redactToken = makeMetadataStreamRedactor();
    const sink: TurnStreamSink = {
      abortSignal: this.controller.signal,
      ...(this.streaming
        ? {
            onToken: (delta: string) => {
              const safe = redactToken(delta);
              if (safe) this.buffer.append("token", { delta: safe });
            },
            onActivity: (activity) => this.buffer.append("activity", activity),
            // §6 — thinking-stream events (status narration + provider
            // reasoning summaries) buffer as `thinking` frames; never evicted
            // (eviction drops only cheap `token` prose).
            onThinking: (event) => this.buffer.append("thinking", event),
          }
        : {}),
    };
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
      const code = this.controller.signal.aborted
        ? "superseded"
        : err instanceof ChatHandlerError
          ? err.message
          : "internal_error";
      // `internal_error` is an UNEXPECTED throw that escaped chatHandler's own
      // try/catch (which logs + persists its router failures). Outside that try —
      // e.g. an upstream LLM 401/timeout, a misconfigured base URL, an error during
      // session/compression/bundle setup — the throw would otherwise become a bare
      // `internal_error` SSE frame with ZERO server-side diagnostics. That blind spot
      // hid a prod chat outage. The runner is the universal catch-all, so it logs the
      // real error (message + stack) here. Expected outcomes are already logged where
      // they arise (ChatHandlerError → chatHandler; supersede → debug), so we don't
      // double-log those.
      if (code === "internal_error") {
        logger.error(
          { err, sessionId: this.sessionId, turnKey: this.turnKey },
          "turn generation failed with an unexpected error",
        );
      }
      this.buffer.append("error", { code });
      this.buffer.markDone();
      return null;
    }
  }
}

export class TurnRegistry {
  private readonly runners = new Map<string, TurnRunner>();
  /** The current (most-recently-started) runner per session, for supersede-cancel. */
  private readonly bySession = new Map<string, TurnRunner>();

  private key(sessionId: string, turnKey: string): string {
    return `${sessionId}::${turnKey}`;
  }

  /** Attach to a running turn for this (session, key), or start one. Idempotent. */
  getOrCreate(sessionId: string, turnKey: string, factory: () => TurnRunner): TurnRunner {
    const k = this.key(sessionId, turnKey);
    const existing = this.runners.get(k);
    if (existing) return existing; // reconnect with a KNOWN key → attach, never supersede

    // A NEW turn (unknown key) for this session SUPERSEDES any still-running prior
    // turn — the user moved on; don't burn compute, and discard its partial output.
    const prior = this.bySession.get(sessionId);
    if (prior && !prior.done) prior.abort();

    const runner = factory();
    this.runners.set(k, runner);
    this.bySession.set(sessionId, runner);
    // Retain after completion for late reconnect/replay, then evict; a reconnect
    // past eviction falls back to the persisted final message (P2.2).
    void runner.completion.finally(() => {
      setTimeout(() => {
        if (this.runners.get(k) === runner) this.runners.delete(k);
        if (this.bySession.get(sessionId) === runner) this.bySession.delete(sessionId);
      }, RETAIN_AFTER_DONE_MS).unref?.();
    });
    return runner;
  }

  /** Look up a running turn (session-scoped — cannot reach another session's). */
  get(sessionId: string, turnKey: string): TurnRunner | undefined {
    return this.runners.get(this.key(sessionId, turnKey));
  }
}
