import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    // 30s (was 10s): these are localhost supertest round-trips, not slow
    // logic. On a loaded CI runner the ephemeral-server setup for a single
    // request can occasionally drift past a tight 10s ceiling (observed a
    // 10.5s overshoot even with files serialized). 30s still fails fast on
    // a genuine hang while absorbing runner contention. See the note below.
    testTimeout: 30000,
    // ── Regression note: flaky parallel runs (2026-05-29) ──────────────
    // Symptom: running the full suite under the default parallel pool
    // failed ONE test on ~1-in-7 runs, a DIFFERENT test each time
    // (observed: app.test.ts "proxies GroundX API calls" → 404, and
    // apiRouteContract.test.ts RT-01 turn-order, and "forwards GroundX
    // route 'API key list'" → "Test timed out in 10000ms"). Sequential
    // runs were 100% green; any single file in isolation passed — so the
    // test LOGIC is sound.
    //
    // Root cause: NOT shared JS state. Vitest's default `forks` pool gives
    // each test file its own process, so there is no in-process singleton
    // to collide (metrics/pino/session state are all per-process or
    // dependency-injected). The shared resource is the OS loopback/socket
    // layer: every supertest `request(app)` call spins up a fresh ephemeral
    // 127.0.0.1 server and opens a new TCP connection (thousands across the
    // ~495-test suite). Run concurrently across forks, these short-lived
    // servers/sockets contend for ephemeral ports + the accept backlog;
    // occasionally a loopback handshake never completes, so the awaiting
    // request hangs until the test timeout. Which test loses the race is
    // random — hence the "different test each run" signature. Ruled out:
    //   • rate limiters — skipped entirely when NODE_ENV==="test".
    //   • CPU oversubscription alone — capping to maxForks=4 still flaked,
    //     so the trigger is socket/loopback pressure, not raw fork count.
    //   • a permanent hang — the losing request is SLOW, not stuck: the
    //     observed overshoot was ~10.5s (just past the old 10s ceiling),
    //     i.e. it would have completed given more time.
    //
    // Fix (two pronged):
    //   1. `fileParallelism: false` — run test files sequentially so the
    //      suite never spins 16 ephemeral supertest servers at once. This
    //      matters doubly on CI: GitHub runners have far fewer cores, so the
    //      default fork fan-out oversubscribes hard. Cost is small in
    //      absolute terms — full suite ~7.3s serial vs ~3.8s parallel.
    //   2. `testTimeout: 30000` (above) — absorb the residual slowness a
    //      loaded runner adds to an individual localhost round-trip.
    //      Serializing alone still overshot 10s once on a busy machine; the
    //      generous ceiling closes that gap while still failing fast on a
    //      real hang.
    // The proper fix that would let us keep file parallelism is to share one
    // `app.listen(0)` server per test file (beforeAll/afterAll) instead of
    // supertest's per-request ephemeral server, across every test file +
    // every `request(app)` call — large and risky for the ~3.5s it saves.
    // Revisit if the serial runtime starts to bite.
    fileParallelism: false,
  },
});
