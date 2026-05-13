/**
 * CommonCancelButton — secondary/cancel action counterpart to CommonSubmitButton.
 *
 * Text-style button in body text color that lifts to green-on-navy on hover. Always
 * pairs with CommonSubmitButton in a modal footer (Cancel + Save), never used
 * standalone. For a standalone secondary button, use `<Button variant="outlined">`
 * with the navy/coral colors documented in `references/buttons.md`.
 *
 * The invisible 1px white border is intentional — it reserves the hit target
 * size so the button doesn't reflow when the hover state changes the
 * background fill.
 */

import Button, { ButtonProps } from "@mui/material/Button";
import { styled } from "@mui/material/styles";
import { FC, ReactNode } from "react";

import {
  BORDER_RADIUS_PILL,
  BODY_TEXT,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  WHITE,
} from "../../constants";

const CancelButton = styled(Button)<ButtonProps>(({ theme }) => ({
  color: BODY_TEXT,
  fontWeight: FONT_WEIGHT_LABEL,
  borderRadius: BORDER_RADIUS_PILL,
  border: `1px solid ${WHITE}`,
  margin: theme.spacing(1),
  boxShadow: "none",
  textTransform: "none",
  "&:hover": {
    color: NAVY,
    backgroundColor: GREEN,
    boxShadow: "none",
  },
}));

interface CommonCancelButtonProps extends ButtonProps {
  children: ReactNode;
}

export const CommonCancelButton: FC<CommonCancelButtonProps> = ({
  children,
  ...props
}) => {
  return (
    <CancelButton variant="text" type="button" disableRipple {...props}>
      {children}
    </CancelButton>
  );
};

export default CommonCancelButton;
