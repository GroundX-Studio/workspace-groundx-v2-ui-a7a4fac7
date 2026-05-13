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

async function expectReadableText(page: Page, text: string, minFontSize = 16) {
  const fontSize = await page.getByText(text).first().evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  expect(fontSize).toBeGreaterThanOrEqual(minFontSize);
}

async function expectHeadingFitsViewport(page: Page, name: string | RegExp) {
  const heading = page.getByRole("heading", { name }).first();
  await expect(heading).toBeVisible();
  const box = await heading.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box && viewport) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  }
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

test.describe("authenticated scaffold shell", () => {
  test("renders header, page title, navigation, account menu, and readable content at every viewport", async ({ page }, testInfo) => {
    await mockAuthenticatedSession(page);
    await page.goto("/home");

    await expectHeadingFitsViewport(page, "Home");
    await expect(page.getByRole("heading", { name: "Studio Workspace" })).toBeVisible();
    await expectReadableText(page, "A ready starting point for authenticated GroundX products, with local middleware, session-aware API proxying, and design-system components already wired.");
    await expect(page.getByRole("button", { name: "About the workspace overview" })).toBeVisible();
    await expect(page.getByText("Build the first customer workflow here")).toBeVisible();

    if (testInfo.project.name === "desktop") {
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Open navigation" })).toHaveCount(0);
    } else {
      await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Close navigation" })).toBeVisible();
      await page.getByRole("button", { name: "Close navigation" }).click();
    }

    await page.getByRole("button", { name: "Open account menu" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "demo@example.com", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Logout" })).toBeVisible();
    await page.waitForTimeout(250);
    await expectNoAccessibilityViolations(page, `authenticated shell ${testInfo.project.name}`);
    await expectNoHorizontalOverflow(page);
  });

  test("opens the onboarding wizard for first-time users and persists completion", async ({ page }) => {
    await mockAuthenticatedSession(page, null);
    await page.goto("/home");

    await expect(page.getByRole("dialog", { name: "Welcome to GroundX Studio" })).toBeVisible();
    await expect(page.getByText("Start with the app shell")).toBeVisible();
    await page.getByRole("button", { name: "Explore navigation" }).click();
    await expect(page.getByText("Use navigation from any screen")).toBeVisible();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText("Add the first product widget")).toBeVisible();
    await expectNoAccessibilityViolations(page, "onboarding wizard");
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByRole("dialog", { name: "Welcome to GroundX Studio" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });
});
