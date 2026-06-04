/**
 * NavRail — the leftmost sidebar (the spec's "Nav", binary 48 ↔ 180px).
 *
 * Top = content (Workspaces active, Projects locked until sign-in). Bottom =
 * account (Book-a-call card, Docs, Sign in). Light surface with a green "G"
 * mark and a tinted active pill, matching the Layout · default split frame.
 * Collapses to an icon-only rail.
 */

import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LoginOutlinedIcon from "@mui/icons-material/LoginOutlined";
import MenuBookOutlinedIcon from "@mui/icons-material/MenuBookOutlined";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import WorkspacesOutlinedIcon from "@mui/icons-material/WorkspacesOutlined";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { ReactNode } from "react";

import {
  BORDER,
  BORDER_RADIUS,
  CYAN,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  TINT,
  WHITE,
} from "@/constants";

import { NAV_WIDTH_COLLAPSED, NAV_WIDTH_EXPANDED } from "../flow/flowData";
import { useFlow } from "../flow/FlowContext";

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active?: boolean;
  locked?: boolean;
  expanded: boolean;
  onClick?: () => void;
}

const NavItem = ({ icon, label, active = false, locked = false, expanded, onClick }: NavItemProps) => {
  const content = (
    <ButtonBase
      onClick={onClick}
      disableRipple
      aria-label={label}
      sx={{
        width: "100%",
        justifyContent: expanded ? "flex-start" : "center",
        gap: 1.25,
        px: expanded ? 1.25 : 0,
        py: 1,
        borderRadius: BORDER_RADIUS,
        color: active ? NAVY : MUTED_ON_LIGHT,
        backgroundColor: active ? alpha(CYAN, 0.55) : "transparent",
        "&:hover": { backgroundColor: active ? alpha(CYAN, 0.65) : TINT },
        "& .MuiSvgIcon-root": { fontSize: 20, color: active ? NAVY : MUTED_ON_LIGHT },
      }}
    >
      {icon}
      {expanded ? (
        <>
          <Typography
            sx={{
              flex: 1,
              textAlign: "left",
              fontSize: 14,
              fontWeight: active ? FONT_WEIGHT_LABEL : 400,
              color: active ? NAVY : MUTED_ON_LIGHT,
            }}
          >
            {label}
          </Typography>
          {locked ? <LockOutlinedIcon sx={{ fontSize: 14, color: MUTED_ON_LIGHT }} /> : null}
        </>
      ) : null}
    </ButtonBase>
  );

  return expanded ? content : <Tooltip title={label} placement="right">{content}</Tooltip>;
};

export function NavRail() {
  const { navExpanded, toggleNav } = useFlow();
  const expanded = navExpanded;

  return (
    <Box
      component="nav"
      aria-label="Primary navigation"
      sx={{
        width: expanded ? NAV_WIDTH_EXPANDED : NAV_WIDTH_COLLAPSED,
        flexShrink: 0,
        height: "100%",
        backgroundColor: WHITE,
        borderRight: `1px solid ${BORDER}`,
        display: "flex",
        flexDirection: "column",
        p: 1,
        transition: "width 180ms ease",
      }}
    >
      {/* Brand + collapse toggle */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 0.5, py: 0.5, minHeight: 40 }}>
        <Box
          sx={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            backgroundColor: GREEN,
            color: NAVY,
            fontWeight: 800,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          G
        </Box>
        {expanded ? (
          <Typography sx={{ flex: 1, fontWeight: 700, color: NAVY, fontSize: 16 }}>GroundX</Typography>
        ) : null}
        <ButtonBase
          onClick={toggleNav}
          disableRipple
          aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
          sx={{
            borderRadius: BORDER_RADIUS,
            p: 0.5,
            color: MUTED_ON_LIGHT,
            "&:hover": { backgroundColor: TINT },
            ...(expanded ? {} : { display: "none" }),
          }}
        >
          <ChevronLeftIcon sx={{ fontSize: 18 }} />
        </ButtonBase>
      </Stack>

      {!expanded ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 0.5 }}>
          <ButtonBase onClick={toggleNav} disableRipple aria-label="Expand navigation" sx={{ p: 0.5, borderRadius: BORDER_RADIUS, color: MUTED_ON_LIGHT, "&:hover": { backgroundColor: TINT } }}>
            <MenuOpenIcon sx={{ fontSize: 18 }} />
          </ButtonBase>
        </Box>
      ) : null}

      <Box sx={{ height: 1, backgroundColor: BORDER, my: 1 }} />

      {/* Top: content */}
      <Stack spacing={0.5}>
        <NavItem icon={<WorkspacesOutlinedIcon />} label="Workspaces" active expanded={expanded} />
        <NavItem icon={<FolderOutlinedIcon />} label="Projects" locked expanded={expanded} />
      </Stack>

      <Box sx={{ flex: 1 }} />

      {/* Bottom: account */}
      <Stack spacing={0.75}>
        {expanded ? (
          <Box sx={{ border: `1px solid ${GREEN}`, borderRadius: BORDER_RADIUS, p: 1.25, backgroundColor: alpha(GREEN, 0.08) }}>
            <Typography sx={{ fontSize: 10, fontWeight: FONT_WEIGHT_LABEL, letterSpacing: LETTER_SPACING_LABEL, color: NAVY }}>
              NEED HELP?
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 700, color: NAVY, mt: 0.25 }}>Book a call →</Typography>
            <Typography sx={{ fontSize: FONT_SIZE_LABEL, color: MUTED_ON_LIGHT }}>30 min with an engineer</Typography>
          </Box>
        ) : (
          <NavItem icon={<CalendarMonthOutlinedIcon />} label="Book a call" expanded={expanded} />
        )}
        <NavItem icon={<MenuBookOutlinedIcon />} label="Docs" expanded={expanded} />
        <NavItem icon={<LoginOutlinedIcon />} label="Sign in" expanded={expanded} />
      </Stack>
    </Box>
  );
}

export default NavRail;
