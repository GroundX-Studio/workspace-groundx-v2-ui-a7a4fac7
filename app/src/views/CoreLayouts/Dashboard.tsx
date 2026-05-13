import AccountCircleOutlinedIcon from "@mui/icons-material/AccountCircleOutlined";
import CloseIcon from "@mui/icons-material/Close";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import MenuIcon from "@mui/icons-material/Menu";
import Alert from "@mui/material/Alert";
import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ListSubheader from "@mui/material/ListSubheader";
import Snackbar from "@mui/material/Snackbar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { APP_LOGOS, APP_NAME } from "@/appConfig";
import {
  BODY_ON_DARK,
  BODY_TEXT,
  BORDER,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  MAIN_BACKGROUND,
  MAIN_CONTENT_PADDING,
  MUTED_ON_DARK,
  NAV_ICON_GREY,
  NAVY,
  WHITE,
  drawerWidth,
} from "@/constants";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import DropdownMenu, { DropdownMenuItemConfig } from "@/shared/components/DropdownMenu";

import { APP_NAVIGATION_BOTTOM_SECTIONS, APP_NAVIGATION_TOP_SECTIONS, AppNavigationSection, findNavigationItem } from "./appNavigation";

const appBarHeight = {
  xs: 56,
  sm: 64,
};

const navRailSx = {
  width: drawerWidth,
  flexShrink: 0,
  "& .MuiDrawer-paper": {
    width: drawerWidth,
    boxSizing: "border-box",
    backgroundColor: NAVY,
    color: BODY_ON_DARK,
    borderRight: "none",
  },
};

interface DashboardNavigationContentProps {
  onClose?: () => void;
  onNavigate?: () => void;
}

interface NavigationSectionListProps {
  sections: AppNavigationSection[];
  onNavigate?: () => void;
}

const NavigationSectionList = ({ sections, onNavigate }: NavigationSectionListProps) => (
  <>
    {sections.map((section) => (
      <List
        key={section.label}
        disablePadding
        subheader={
          <ListSubheader
            component="li"
            sx={{
              backgroundColor: "transparent",
              color: MUTED_ON_DARK,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              letterSpacing: "0.08em",
              lineHeight: 1.5,
              px: 1.5,
              py: 1,
              textTransform: "uppercase",
            }}
          >
            {section.label}
          </ListSubheader>
        }
        sx={{ mb: 1 }}
      >
        {section.items.map((item) => (
          <ListItem key={item.path} disablePadding>
            <ListItemButton
              component={NavLink}
              to={item.path}
              onClick={onNavigate}
              sx={{
                minHeight: 44,
                borderRadius: 1,
                color: BODY_ON_DARK,
                gap: 1.25,
                px: 1.5,
                "& .MuiListItemIcon-root": {
                  color: NAV_ICON_GREY,
                  minWidth: 32,
                },
                "&.active": {
                  backgroundColor: GREEN,
                  color: NAVY,
                  fontWeight: FONT_WEIGHT_LABEL,
                  "& .MuiListItemIcon-root": {
                    color: NAVY,
                  },
                },
                "&:hover": {
                  backgroundColor: alpha(WHITE, 0.1),
                },
                "&.active:hover": {
                  backgroundColor: GREEN,
                },
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ variant: "body2", fontWeight: "inherit" }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    ))}
  </>
);

const DashboardNavigationContent = ({ onClose, onNavigate }: DashboardNavigationContentProps) => (
  <Box sx={{ display: "flex", minHeight: "100%", flexDirection: "column", p: 1.5 }}>
    <Toolbar disableGutters sx={{ minHeight: appBarHeight, gap: 1.5, px: 1 }}>
      <Box
        component="img"
        src={APP_LOGOS.dark.src}
        alt={APP_LOGOS.dark.alt}
        sx={{
          display: "block",
          maxWidth: 178,
          minWidth: 0,
          width: "100%",
        }}
      />
      {onClose ? (
        <IconButton
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
          sx={{ ml: "auto", color: WHITE, "&:hover": { backgroundColor: alpha(WHITE, 0.1) } }}
        >
          <CloseIcon />
        </IconButton>
      ) : null}
    </Toolbar>

    <Box component="nav" aria-label="Primary navigation" sx={{ display: "flex", flex: 1, flexDirection: "column", pt: 2 }}>
      <Box data-testid="side-rail-top-menu">
        <NavigationSectionList sections={APP_NAVIGATION_TOP_SECTIONS} onNavigate={onNavigate} />
      </Box>
      <Box data-testid="side-rail-bottom-menu" sx={{ mt: "auto", pt: 2 }}>
        <NavigationSectionList sections={APP_NAVIGATION_BOTTOM_SECTIONS} onNavigate={onNavigate} />
      </Box>
    </Box>
  </Box>
);

export const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isCompactNavigation = useMediaQuery(theme.breakpoints.down("md"));
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const { logout, user } = useAuthContext();
  const { isLoading } = useIsLoading();
  const { successMessage, errorMessage, setSuccessMessage, setErrorMessage } = useMessageContext();
  const currentPageTitle = useMemo(() => findNavigationItem(location.pathname)?.label ?? APP_NAME, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate(ROUTER_PATHS.AUTH_LOGIN);
  };

  const accountMenuItems: DropdownMenuItemConfig[] = [
    ...(user?.email ? [{ label: user.email, onClick: () => undefined }] : []),
    ...(user?.username ? [{ label: `Account ${user.username}`, onClick: () => undefined }] : []),
    { label: "Logout", onClick: handleLogout, icon: <LogoutOutlinedIcon fontSize="small" /> },
  ];

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", backgroundColor: MAIN_BACKGROUND }}>
      {isCompactNavigation ? null : (
        <Drawer variant="permanent" open sx={navRailSx}>
          <DashboardNavigationContent />
        </Drawer>
      )}

      <Box sx={{ display: "flex", minWidth: 0, flex: 1, flexDirection: "column" }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            backgroundColor: WHITE,
            color: NAVY,
            borderBottom: `1px solid ${BORDER}`,
          }}
        >
          <Toolbar sx={{ minHeight: appBarHeight, gap: { xs: 1, sm: 2 }, px: { xs: 2, sm: 3 } }}>
            {isCompactNavigation ? (
              <IconButton
                type="button"
                aria-label="Open navigation"
                disableRipple
                onClick={() => setIsMobileNavigationOpen(true)}
                sx={{ color: NAVY, "&:hover": { backgroundColor: alpha(NAVY, 0.08) } }}
              >
                <MenuIcon />
              </IconButton>
            ) : null}

            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography variant="caption" sx={{ display: "block", color: BODY_TEXT, lineHeight: 1.2 }}>
                {APP_NAME}
              </Typography>
              <Typography variant="h6" fontWeight={FONT_WEIGHT_LABEL} noWrap>
                {currentPageTitle}
              </Typography>
            </Box>

            <DropdownMenu
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              items={accountMenuItems}
              trigger={({ onClick, open }) => (
                <IconButton
                  type="button"
                  aria-label="Open account menu"
                  aria-haspopup="menu"
                  aria-expanded={open ? "true" : undefined}
                  disableRipple
                  onClick={onClick}
                  sx={{ color: NAVY, "&:hover": { backgroundColor: alpha(NAVY, 0.08) } }}
                >
                  <AccountCircleOutlinedIcon />
                </IconButton>
              )}
            />
          </Toolbar>
          {isLoading ? <LinearProgress /> : null}
        </AppBar>

        <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 3, md: MAIN_CONTENT_PADDING } }}>
          <Typography component="h1" variant="h2" sx={{ mb: 3 }}>
            {currentPageTitle}
          </Typography>
          <Outlet />
        </Box>
      </Box>

      {isCompactNavigation ? (
        <Drawer
          variant="temporary"
          open={isMobileNavigationOpen}
          onClose={() => setIsMobileNavigationOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={navRailSx}
        >
          <DashboardNavigationContent
            onClose={() => setIsMobileNavigationOpen(false)}
            onNavigate={() => setIsMobileNavigationOpen(false)}
          />
        </Drawer>
      ) : null}

      <Snackbar open={Boolean(successMessage)} autoHideDuration={3000} onClose={() => setSuccessMessage("")}>
        <Alert severity="success" onClose={() => setSuccessMessage("")}>
          {successMessage}
        </Alert>
      </Snackbar>
      <Snackbar open={Boolean(errorMessage)} autoHideDuration={6000} onClose={() => setErrorMessage("")}>
        <Alert severity="error" onClose={() => setErrorMessage("")}>
          {errorMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
};
