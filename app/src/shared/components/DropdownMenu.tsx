import { Box, Menu, MenuItem, MenuProps } from "@mui/material";
import { styled } from "@mui/material/styles";
import { MouseEvent, ReactNode, useState } from "react";

import { BODY_TEXT, BORDER, BORDER_RADIUS_2X, NAVY, WHITE } from "../../constants";

const StyledMenu = styled(Menu)(() => ({
  "& .MuiPaper-root": {
    backgroundColor: WHITE,
    border: `1px solid ${BORDER}`,
    borderRadius: BORDER_RADIUS_2X,
    boxShadow: "none",
    color: NAVY,
    minWidth: 180,
  },
  "& .MuiMenuItem-root": {
    color: NAVY,
  },
  "& .MuiMenuItem-root.Mui-disabled": {
    color: BODY_TEXT,
    opacity: 1,
  },
}));

export interface DropdownMenuItemConfig {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface DropdownMenuProps extends Omit<MenuProps, "open" | "anchorEl"> {
  trigger: (controls: { onClick: (event: MouseEvent<HTMLElement>) => void; open: boolean }) => ReactNode;
  items: DropdownMenuItemConfig[];
}

export function DropdownMenu({ trigger, items, ...menuProps }: DropdownMenuProps) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      {trigger({
        onClick: (event) => setAnchorEl(event.currentTarget),
        open,
      })}
      <StyledMenu anchorEl={anchorEl} open={open} onClose={() => setAnchorEl(null)} {...menuProps}>
        {items.map((item) => (
          <MenuItem
            key={item.label}
            disableRipple
            onClick={() => {
              item.onClick();
              setAnchorEl(null);
            }}
            disabled={item.disabled}
            sx={
              item.disabled
                ? {
                    color: BODY_TEXT,
                    opacity: "1 !important",
                  }
                : undefined
            }
          >
            {item.icon ? (
              <Box component="span" sx={{ mr: 1, display: "inline-flex", alignItems: "center" }}>
                {item.icon}
              </Box>
            ) : null}
            {item.label}
          </MenuItem>
        ))}
      </StyledMenu>
    </>
  );
}

export default DropdownMenu;
