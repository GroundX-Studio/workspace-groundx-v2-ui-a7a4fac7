import { Box, Divider, Menu, MenuItem, MenuProps } from "@mui/material";
import { styled } from "@mui/material/styles";
import { Fragment, MouseEvent, ReactNode, useState } from "react";

import { BODY_TEXT, BORDER, BORDER_RADIUS_CARD, NAVY, WHITE } from "@/constants";

const StyledMenu = styled(Menu)(() => ({
  "& .MuiPaper-root": {
    backgroundColor: WHITE,
    border: `1px solid ${BORDER}`,
    borderRadius: BORDER_RADIUS_CARD,
    boxShadow: "none",
    color: NAVY,
    marginTop: 8,
    minWidth: 320,
    overflow: "hidden",
  },
  "& .MuiMenuItem-root": {
    alignItems: "center",
    color: NAVY,
    fontSize: "1rem",
    gap: 1.5,
    minHeight: 48,
    paddingInline: 2,
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
  dividerAfter?: boolean;
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
          <Fragment key={item.label}>
            <MenuItem
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
                <Box component="span" sx={{ color: "inherit", display: "inline-flex", alignItems: "center" }}>
                  {item.icon}
                </Box>
              ) : null}
              <Box component="span" sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.label}
              </Box>
            </MenuItem>
            {item.dividerAfter ? <Divider /> : null}
          </Fragment>
        ))}
      </StyledMenu>
    </>
  );
}

export default DropdownMenu;
