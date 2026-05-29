/**
 * widget-llm-integration Phase 5b — TextField tool-binding contract.
 * See Button.test-d.tsx for the rationale + how this gate works.
 *
 * TextFields are tools too: the user typing into them is an action
 * the LLM should be able to drive ("fill the email field with X").
 */
import { TextField } from "./TextField";

// 1. Bare TextField must fail.
// @ts-expect-error — TextField requires either `tool` or `noTool`.
const _bare = <TextField label="Email" />;

// 2. `tool="..."` compiles.
const _withTool = <TextField tool="edit_email" label="Email" />;

// 3. `noTool="..."` compiles.
const _withNoTool = (
  <TextField
    noTool="search field — Phase 7 will declare a `search_documents` tool"
    label="Search"
  />
);

export { _bare, _withTool, _withNoTool };
