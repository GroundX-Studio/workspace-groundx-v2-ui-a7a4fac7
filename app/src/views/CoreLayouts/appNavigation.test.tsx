import { describe, expect, it } from "vitest";

import { ROUTER_PATHS } from "@/router/routerPaths";

import {
  APP_NAVIGATION_BOTTOM_SECTIONS,
  APP_NAVIGATION_SECTIONS,
  APP_NAVIGATION_TOP_SECTIONS,
  findNavigationItem,
} from "./appNavigation";

const navItems = APP_NAVIGATION_SECTIONS.flatMap((section) => section.items);
const routePathValues = new Set(Object.values(ROUTER_PATHS));

describe("app navigation contract", () => {
  it("keeps explicit top and bottom menu slots in the scaffold", () => {
    expect(APP_NAVIGATION_TOP_SECTIONS).toBeDefined();
    expect(APP_NAVIGATION_BOTTOM_SECTIONS).toBeDefined();
    expect(APP_NAVIGATION_SECTIONS).toEqual([...APP_NAVIGATION_TOP_SECTIONS, ...APP_NAVIGATION_BOTTOM_SECTIONS]);
    expect(APP_NAVIGATION_TOP_SECTIONS.flatMap((section) => section.items).map((item) => item.label)).toContain("Home");
    expect(APP_NAVIGATION_BOTTOM_SECTIONS.flatMap((section) => section.items).map((item) => item.label)).toContain("App Status");
  });

  it("keeps each nav path backed by a router path constant", () => {
    expect(navItems.length).toBeGreaterThan(0);

    for (const item of navItems) {
      expect(routePathValues.has(item.path)).toBe(true);
      expect(item.path).toMatch(/^\//);
      expect(item.path).not.toContain(":");
    }
  });

  it("keeps navigation labels and paths unique", () => {
    const labels = navItems.map((item) => item.label);
    const paths = navItems.map((item) => item.path);

    expect(new Set(labels).size).toBe(labels.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("keeps every nav item accessible and icon-backed", () => {
    for (const item of navItems) {
      expect(item.label.trim()).toBe(item.label);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.icon).toBeTruthy();
    }
  });

  it("resolves the current page title from the active pathname", () => {
    expect(findNavigationItem(ROUTER_PATHS.HOME)?.label).toBe("Home");
    expect(findNavigationItem(ROUTER_PATHS.APP_STATUS)?.label).toBe("App Status");
    expect(findNavigationItem(ROUTER_PATHS.HEALTH)).toBeUndefined();
    expect(findNavigationItem("/unknown")).toBeUndefined();
  });
});
