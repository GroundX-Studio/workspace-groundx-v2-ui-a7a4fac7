import { expect, test } from "@playwright/test";

/**
 * F2 compact-mode end-to-end.
 *
 * Below the md breakpoint (900px) the AppShell renders its compact
 * branch: a sticky top bar with a hamburger and a "View canvas" pill,
 * the chat pane filling the viewport, and the nav available as a
 * slide-in drawer overlay. This spec exercises the user-visible
 * surface on a 375-px viewport (iPhone X-class) and a 768-px viewport
 * (iPad-portrait class) to defend against regressions that the
 * jsdom-based unit tests can't catch.
 */

const MOBILE = { width: 375, height: 812 } as const;
const TABLET_PORTRAIT = { width: 768, height: 1024 } as const;

test.describe("F2 compact mode", () => {
  test("mobile (375px): hamburger opens the nav drawer; backdrop closes it", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/onboarding");

    // Land on F1, kick BYO flow to advance to F2 (the gate-as-message lives there).
    const byo = page.getByRole("button", { name: /bring your own data/i }).first();
    await byo.click();

    // Compact top bar present; aside (desktop nav column) is NOT in the row.
    await expect(page.getByTestId("appshell-compact-topbar")).toBeVisible();
    await expect(page.locator("aside[aria-label='Primary navigation']")).toHaveCount(0);

    // Drawer closed at first: nav children not mounted.
    await expect(page.getByTestId("onboarding-nav")).toHaveCount(0);

    // Open the drawer.
    await page.getByTestId("appshell-compact-nav-toggle").click();
    await expect(page.getByTestId("appshell-compact-nav-drawer")).toBeVisible();
    await expect(page.getByTestId("onboarding-nav")).toBeVisible();

    // Click the backdrop to close.
    await page.getByTestId("appshell-compact-nav-backdrop").click();
    await expect(page.getByTestId("appshell-compact-nav-drawer")).toHaveCount(0);
  });

  test("mobile (375px): view-swap pill toggles between chat and canvas", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /bring your own data/i }).first().click();

    // Compact mode starts in focus-chat: chat pane visible, canvas hidden.
    await expect(page.getByTestId("appshell-chat")).toBeVisible();
    await expect(page.getByTestId("appshell-canvas")).toHaveCount(0);

    // Toggle pill should read "View canvas" first (explicit verb-action copy,
    // not the bare-noun "Canvas" that an earlier draft used).
    const toggle = page.getByTestId("appshell-compact-view-toggle");
    await expect(toggle).toHaveText(/view canvas/i);

    // Tap to swap.
    await toggle.click();
    await expect(page.getByTestId("appshell-chat")).toHaveCount(0);
    await expect(page.getByTestId("appshell-canvas")).toBeVisible();
    await expect(toggle).toHaveText(/view chat/i);

    // Tap again to swap back.
    await toggle.click();
    await expect(page.getByTestId("appshell-chat")).toBeVisible();
    await expect(page.getByTestId("appshell-canvas")).toHaveCount(0);
  });

  test("mobile (375px): no horizontal overflow at F2", async ({ page }) => {
    await page.setViewportSize(MOBILE);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /bring your own data/i }).first().click();
    // The gate card and its parent layout must stay within the viewport.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("tablet portrait (768px): also runs compact-mode top bar", async ({ page }) => {
    await page.setViewportSize(TABLET_PORTRAIT);
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /bring your own data/i }).first().click();
    await expect(page.getByTestId("appshell-compact-topbar")).toBeVisible();
    await expect(page.locator("aside[aria-label='Primary navigation']")).toHaveCount(0);
  });

  test("desktop (1280px): NO compact top bar; the three-pane layout renders", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/onboarding");
    await page.getByRole("button", { name: /bring your own data/i }).first().click();
    await expect(page.getByTestId("appshell-compact-topbar")).toHaveCount(0);
    await expect(page.locator("aside[aria-label='Primary navigation']")).toBeVisible();
  });
});
