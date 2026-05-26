/**
 * DialogTitle — modal title row with a built-in close button.
 *
 * Pair with MUI's `<Dialog>` + `<DialogContent>` + `<DialogActions>`. Pass
 * the title text as children and an `onClose` callback for the close icon.
 *
 * Renders as a flex row: title on the left, IconButton on the right.
 */

import { DialogTitle as MuiDialogTitle, Typography } from "@mui/material";
import { ReactNode } from "react";

import { FONT_SIZE_H5, FONT_WEIGHT_LABEL, NAVY } from "@/constants";

import { IconButton } from "@/components/primitives/IconButton/IconButton";

interface DialogTitleProps {
  children: ReactNode;
  onClose?: () => void;
}

export function DialogTitle({ children, onClose }: DialogTitleProps) {
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
      {onClose && <IconButton onClick={onClose} />}
    </MuiDialogTitle>
  );
}

export default DialogTitle;
