/**
 * DialogTitle — LLM tool declarations.
 *
 * 2026-05-31-tool-system-completion (wf04 §4). The `DialogTitle` is a PRIMITIVE
 * (modal title row + close control), so this file lives in the primitive
 * glob-home (`components/primitives/**`) opened by this change. One tool:
 *
 *   • `close_dialog()` — dismiss the active dialog. Mutate-category. The
 *     mirrored middleware tool builds the `closeDialog` CanvasIntent; the
 *     DialogTitle registers an adapter that calls its own `onClose` — the SAME
 *     action the close IconButton invokes. No dormant plumbing.
 *
 * Role (access matrix): all roles. Closing a dialog is open to anyone who can
 * see it. Mirrored on the server `SERVER_TOOL_CATALOG`.
 */
import { z } from "zod";

import type { WidgetTool } from "@/tools/types";

const closeDialog: WidgetTool = {
  name: "close_dialog",
  description:
    "Close the currently-open dialog via its title-bar close control. Use when the user " +
    "asks to close, dismiss, or cancel the open modal / dialog.",
  category: "mutate",
  input: z.object({}),
};

export const tools: WidgetTool[] = [closeDialog];
