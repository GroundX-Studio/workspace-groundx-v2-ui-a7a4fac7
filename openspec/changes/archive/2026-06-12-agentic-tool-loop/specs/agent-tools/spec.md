# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: Server-executed tools SHALL be declared via `serverExecute` and excluded from intent routing

`ServerTool` SHALL gain an optional `serverExecute` executor. A tool declaring
it is executed by the middleware inside the grounded tool-result loop and
SHALL NOT declare an `intentBuilder`, SHALL NOT produce a `CanvasIntent`,
SHALL NOT surface as a chip, and SHALL be `category: "read"` — invariants
enforced by a catalog test (exactly one of `serverExecute` / `intentBuilder`
present; `serverExecute ⇒ read`; `serverExecute ⇒ activityLabel` present,
the user-facing text for the reply's `toolActivity` annotation). Executor
dependencies SHALL arrive via an injected `ServerExecuteContext` built from
the grounded seam's deps (test-injectable) — an executor SHALL NOT close
over module-level live dependencies. Server-executed tools SHALL appear in the
app-side parity guard's existing server-only allowlist (the `suggest_intent`
mechanism — no new exclusion machinery). Every server-executed tool SHALL be
covered by an LLM-free scripted LOOP-transcript fixture (the counterpart of
the intentBuilder corpus): a stubbed provider emits the call, the suite
asserts execution, transcript shape, and absence from `intents[]`/chips.

#### Scenario: Catalog invariants hold

- **GIVEN** the `SERVER_TOOL_CATALOG`
- **WHEN** the invariant test runs
- **THEN** every tool has exactly one of `serverExecute` / `intentBuilder`
- **AND** every `serverExecute` tool is `category: "read"`
- **AND** every `serverExecute` tool declares an `activityLabel`.

#### Scenario: A server-executed tool without loop coverage fails the guard

- **GIVEN** a new tool declaring `serverExecute` with no loop-transcript fixture
- **WHEN** the coverage guard runs
- **THEN** it fails, naming the uncovered tool.

### Requirement: lookup_groundx_docs SHALL retrieve vendored GroundX documentation on demand

The catalog SHALL include `lookup_groundx_docs` — `category: "read"`,
server-executed, available in every step and to every role (the pack is
public documentation; nothing tenant-scoped). Its input is
`{ query: string }` (Zod, min length 3). Its executor SHALL invoke the
injected retrieval seam (`ctx.skillsRetrieve`, which the loop builds from
the grounded seam's deps and which defaults to the existing
`retrieveGroundxKnowledge` — consistent with the no-module-closure rule
above) over the vendored pack with the entry
bar bypassed (the model's decision to call is the gate) and the retriever's
section ranking and character/section caps intact; a missing pack or
zero-scoring query SHALL return a terse "no matching documentation" string
(the turn succeeds). The tool SHALL declare `promptGuidance` steering the
model to call it only when the injected `GROUNDX KNOWLEDGE` block is absent
or insufficient, and never to cite the result. The tool's `description` SHALL
satisfy the server catalog guard (`Use when`/`Triggers when` clause, ≥40
chars) and its `query` field SHALL carry `.describe()`, and the tool name
SHALL be added to the server `EXPECTED_NAMES` authoritative set. The tool
SHALL declare `activityLabel: "Checked GroundX docs"`, surfaced via the chat
reply's `toolActivity` contract (see chat-routing delta). The app-side
`check-tool-quality` verb allowlist SHALL NOT be modified — that scanner
covers only app-mirrored `*.tools.ts`, and a server-only tool never reaches
its verb check.

#### Scenario: Lookup returns ranked sections

- **GIVEN** the vendored pack is present
- **WHEN** the executor runs with query "how does x-ray chunking work"
- **THEN** it returns the retriever's top-ranked sections within the standard caps.

#### Scenario: Missing pack degrades to a no-match string

- **GIVEN** a checkout without the synced pack
- **WHEN** the executor runs
- **THEN** it returns the no-match string and the chat turn succeeds.
