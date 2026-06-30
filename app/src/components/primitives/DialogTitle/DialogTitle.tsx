/**
 * DialogTitle — modal title row with a built-in close button.
 *
 * Pair with MUI's `<Dialog>` + `<DialogContent>` + `<DialogActions>`. Pass
 * the title text as children and an `onClose` callback for the close icon.
 *
 * Renders as a flex row: title on the left, IconButton on the right.
 */

import { DialogTitle as MuiDialogTitle, Typography } from "@mui/material";
import { ReactNode, useEffect } from "react";

import { FONT_SIZE_H5, FONT_WEIGHT_LABEL, NAVY } from "@/constants";

import { IconButton } from "@/components/primitives/IconButton/IconButton";
import { useCanvasOrchestratorOptional } from "@/contexts/CanvasOrchestratorContext";

interface DialogTitleProps {
  children: ReactNode;
  onClose?: () => void;
}

export function DialogTitle({ children, onClose }: DialogTitleProps) {
  // 2026-05-31-tool-system-completion (wf04 §4) — register an orchestrator
  // adapter so the `close_dialog` LLM tool routes to the SAME `onClose` the
  // close IconButton invokes. Only registered when this title owns a close
  // control (`onClose` present). No-op when no CanvasOrchestratorProvider is
  // mounted (standalone tests). Last-registration-wins matches the typical
  // single-open-dialog case.
  const orchestrator = useCanvasOrchestratorOptional();
  useEffect(() => {
    if (!orchestrator || !onClose) return;
    return orchestrator.registerAdapter({ kind: "closeDialog", apply: () => onClose() });
  }, [orchestrator, onClose]);

  return (
    <MuiDialogTitle
      component="div"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Typography
        component="h2"
        sx={{
          color: NAVY,
          fontWeight: FONT_WEIGHT_LABEL,
          fontSize: FONT_SIZE_H5,
        }}
      >
        {children}
      </Typography>
      {onClose && <IconButton tool="close_dialog" onClick={onClose} />}
    </MuiDialogTitle>
  );
}

export default DialogTitle;
