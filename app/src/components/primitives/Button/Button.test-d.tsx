/**
 * widget-llm-integration Phase 5b — Button tool-binding type contract.
 *
 * Pinned via `@ts-expect-error` directives, so `npx tsc --noEmit` is
 * the gate. The directives only suppress an error when one would
 * otherwise occur — if the assertion stops being true (the contract
 * regresses), tsc reports "Unused '@ts-expect-error'" and the build
 * fails.
 *
 * Three rules:
 *   1. Bare `<Button onClick=...>` (no tool / no noTool) MUST fail.
 *   2. `<Button tool="x" ...>` MUST compile.
 *   3. `<Button noTool="why" ...>` MUST compile.
 */
import { Button } from "./Button";

const noop = () => {};

// 1. Bare Button must fail compilation.
// @ts-expect-error — Button requires either `tool` or `noTool` (Phase 5b).
const _bare = <Button onClick={noop}>Save</Button>;

// 2. `tool="..."` compiles.
const _withTool = <Button tool="save_thing" onClick={noop}>Save</Button>;

// 3. `noTool="..."` compiles.
const _withNoTool = (
  <Button noTool="external redirect — not an in-app action" onClick={noop}>
    External
  </Button>
);

// Sanity: passing both is rejected by the discriminated union.
// @ts-expect-error — tool + noTool are mutually exclusive.
const _both = <Button tool="x" noTool="y" onClick={noop}>X</Button>;

// Re-export to silence "unused const" complaints under TS isolatedModules.
export { _bare, _withTool, _withNoTool, _both };
