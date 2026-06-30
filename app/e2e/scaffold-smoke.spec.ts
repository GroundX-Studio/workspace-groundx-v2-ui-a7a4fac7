import AxeBuilder from "@axe-core/playwright";
import { expect, Page, test } from "@playwright/test";

const authenticatedUser = {
  authenticated: true,
  username: "demo@example.com",
  customer: {
    email: "demo@example.com",
    first: "Demo",
    last: "User",
    username: "demo@example.com",
    company: "GroundX Studio Harness",
  },
};

async function mockAuthenticatedSession(page: Page, onboardingState: string | null = "complete") {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...authenticatedUser,
        appMetadata: { groundxUsername: "demo@example.com", onboardingState },
      }),
    });
  });
  await page.route("**/api/me/metadata", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ appMetadata: { groundxUsername: "demo@example.com", onboardingState: "complete" } }),
    });
  });
  await page.route("**/api/auth/logout", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    )
    .toBeLessThanOrEqual(1);
}

async function expectNoAccessibilityViolations(page: Page, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(results.violations, `${name} has axe accessibility violations`).toEqual([]);
}

test.describe("public authentication pages", () => {
  for (const route of ["/auth/login", "/auth/register", "/auth/reset-password"]) {
    test(`${route} renders responsively without horizontal overflow`, async ({ page }) => {
      await page.goto(route);

      await expect(page.getByAltText("GroundX Studio")).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expect(page.locator("main")).toBeVisible();
      const mainBox = await page.locator("main").boundingBox();
      const viewport = page.viewportSize();
      expect(mainBox).not.toBeNull();
      expect(viewport).not.toBeNull();
      if (mainBox && viewport) {
        expect(mainBox.width).toBeLessThanOrEqual(viewport.width);
      }
      await expectNoAccessibilityViolations(page, route);
    });
  }
});

// `/home` is no longer the scaffold's marketing page — since ARCH-21 it is an
// auth-aware REDIRECT (`views/Home/Home.tsx`). An authenticated user is bounced
// off `/home` into the real app: the steady conversation surface `/c/<id>` (the
// app bootstraps a chat session for an authed user, so the deep-link branch is
// the live path) — never stranded on `/home`, never the deleted scaffold
// "Studio Workspace" page + first-run wizard the old tests asserted.
test.describe("authenticated /home entry redirect", () => {
  test("authed /home redirects into the steady conversation shell, responsive at every viewport", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await page.goto("/home");

    // The redirect fires off `/home` into the steady conversation route.
    await page.waitForURL(/\/c\//);
    expect(new URL(page.url()).pathname).not.toMatch(/\/home$/);

    // The steady shell mounts its AppShell (the real authenticated surface, not
    // the deleted scaffold marketing page). Assert the shell root rather than a
    // specific nav control, which lives behind a drawer toggle in compact mode.
    await expect(page.getByTestId("appshell-root").first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
  });
});
