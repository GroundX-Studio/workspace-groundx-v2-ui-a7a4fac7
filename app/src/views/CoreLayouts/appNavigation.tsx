import HomeOutlinedIcon from "@mui/icons-material/HomeOutlined";
import MonitorHeartOutlinedIcon from "@mui/icons-material/MonitorHeartOutlined";
import { ReactElement } from "react";

import { ROUTER_PATHS } from "@/router/routerPaths";

export interface AppNavigationItem {
  label: string;
  path: string;
  icon: ReactElement;
}

export interface AppNavigationSection {
  label: string;
  items: AppNavigationItem[];
}

export const APP_NAVIGATION_TOP_SECTIONS: AppNavigationSection[] = [
  {
    label: "Workspace",
    items: [{ label: "Home", path: ROUTER_PATHS.HOME, icon: <HomeOutlinedIcon /> }],
  },
];

export const APP_NAVIGATION_BOTTOM_SECTIONS: AppNavigationSection[] = [
  {
    label: "System",
    items: [{ label: "App Status", path: ROUTER_PATHS.APP_STATUS, icon: <MonitorHeartOutlinedIcon /> }],
  },
];

export const APP_NAVIGATION_SECTIONS: AppNavigationSection[] = [
  ...APP_NAVIGATION_TOP_SECTIONS,
  ...APP_NAVIGATION_BOTTOM_SECTIONS,
];

export const findNavigationItem = (pathname: string): AppNavigationItem | undefined =>
  APP_NAVIGATION_SECTIONS.flatMap((section) => section.items).find((item) => item.path === pathname);
