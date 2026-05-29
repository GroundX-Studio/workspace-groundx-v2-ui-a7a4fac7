/**
 * widget-llm-integration Phase 5b — IconButton tool-binding contract.
 * See Button.test-d.tsx for the rationale + how this gate works.
 */
import EditIcon from "@mui/icons-material/Edit";
import { IconButton } from "./IconButton";

const noop = () => {};

// 1. Bare IconButton must fail.
// @ts-expect-error — IconButton requires either `tool` or `noTool`.
const _bare = <IconButton onClick={noop} aria-label="edit" icon={<EditIcon />} />;

// 2. `tool="..."` compiles.
const _withTool = (
  <IconButton tool="edit_field" onClick={noop} aria-label="edit" icon={<EditIcon />} />
);

// 3. `noTool="..."` compiles.
const _withNoTool = (
  <IconButton
    noTool="closes a local-only popover — not an in-app action"
    onClick={noop}
    aria-label="close"
  />
);

export { _bare, _withTool, _withNoTool };
