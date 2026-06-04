import { expect, Page, test } from "@playwright/test";

/**
 * End-to-end smoke for the chat-driven onboarding flow at /start, against the
 * production build. The split layout is desktop-only until the responsive slice,
 * so these run on the desktop project only.
 */

// Collect uncaught errors + console errors (ignoring the expected no-backend /api noise).
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    if (/\/api\/|Authentication required|Failed to load resource|net::ERR/i.test(text)) return;
    errors.push(`console.error: ${text}`);
  });
  return errors;
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
}

// The split layout is desktop-only until the responsive slice.
const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "Onboarding split layout is desktop-only");

test.describe("onboarding flow (/start)", () => {
  test("walks the Ingest → Understand → Extract → peek → Interact path with no console errors", async ({ page }) => {
    desktopOnly();
    const errors = trackErrors(page);

    await page.goto("/start");

    // P1 · Ingest
    await expect(page.getByRole("heading", { name: "Connect your data to GroundX." })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try the .* sample/ })).toHaveCount(3);
    await expectNoHorizontalOverflow(page);

    // P1 → P2 · Understand (pick the canonical sample)
    await page.getByRole("button", { name: "Try the Utility Bill sample" }).click();
    await expect(page.getByText("Conversation")).toBeVisible();
    await expect(page.getByText("Pick a view:")).toBeVisible();

    // P2 → P3 · Extract
    await page.getByRole("button", { name: "meters", exact: true }).click();
    await expect(page.getByText("Extracted fields")).toBeVisible();
    await expect(page.getByText("PEAK_DEMAND_KW")).toBeVisible();
    await expect(page.getByRole("button", { name: "unlock everything →" })).toBeVisible();

    // P3 → P4 · provenance peek
    await page.getByRole("button", { name: "Open provenance for PEAK_DEMAND_KW" }).click();
    await expect(page.getByText("Field provenance")).toBeVisible();
    await expect(page.getByText("WHY MATCHED")).toBeVisible();
    await expect(page.getByText(/region \(520, 380\)/)).toBeVisible();

    // P4 → collapse → P3
    await page.getByRole("button", { name: "← all fields" }).click();
    await expect(page.getByText("Extracted fields")).toBeVisible();

    // P3 → P5 · Interact comparison
    await page.getByRole("button", { name: "compare two meters" }).click();
    await expect(page.getByText("How does meter #3 compare to the others?")).toBeVisible();
    await expect(page.getByText(/6 small meters combined < #3 alone/)).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(errors, "no uncaught/console errors during the flow").toEqual([]);
  });

  test("shows a coming-soon state for a sample that isn't wired up", async ({ page }) => {
    desktopOnly();
    const errors = trackErrors(page);
    await page.goto("/start");

    await page.getByRole("button", { name: "Try the Solar Project Portfolio sample" }).click();

    await expect(page.getByText(/coming soon/i).first()).toBeVisible();
    // Switcher returns to ingest.
    await page.getByRole("button", { name: /Switch sample/ }).click();
    await expect(page.getByRole("heading", { name: "Connect your data to GroundX." })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("opens the inline sign-in gate, books a call, and dismisses (P6 / P6a)", async ({ page }) => {
    desktopOnly();
    const errors = trackErrors(page);
    await page.goto("/start");
    await page.getByRole("button", { name: "Try the Utility Bill sample" }).click();
    await page.getByRole("button", { name: "meters", exact: true }).click();

    // "unlock everything" opens the gate inline; the canvas stays behind.
    await page.getByRole("button", { name: "unlock everything →" }).click();
    await expect(page.getByText("CONTINUE WITH…")).toBeVisible();
    await expect(page.getByText("Extracted fields")).toBeVisible();

    // Book a call → Calendly embed in the canvas, then back to sign-in.
    await page.getByRole("button", { name: "Book a call" }).click();
    await expect(page.getByText("Select a Date & Time")).toBeVisible();
    await page.getByRole("button", { name: "← back to sign-in" }).click();
    await expect(page.getByText("CONTINUE WITH…")).toBeVisible();

    // Dismiss → back to exploring, Extract still behind.
    await page.getByRole("button", { name: "Dismiss sign-in" }).click();
    await expect(page.getByText("CONTINUE WITH…")).toHaveCount(0);
    await expect(page.getByText("Extracted fields")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("jumps to Integrate (P7) from the step strip and re-opens the gate from the locked banner", async ({ page }) => {
    desktopOnly();
    const errors = trackErrors(page);
    await page.goto("/start");
    await page.getByRole("button", { name: "Try the Utility Bill sample" }).click();

    await page.getByRole("button", { name: "Go to Integrate" }).click();
    await expect(page.getByText("Call it directly")).toBeVisible();
    await expect(page.getByText("Drop into your agent")).toBeVisible();
    await expect(page.getByText("how do I run this from my own code?")).toBeVisible();

    await page.getByRole("button", { name: "unlock everything →" }).click();
    await expect(page.getByText("CONTINUE WITH…")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("supports the layout controls: nav collapse, chat focus, and divider keyboard resize", async ({ page }) => {
    desktopOnly();
    await page.goto("/start");
    await page.getByRole("button", { name: "Try the Utility Bill sample" }).click();
    await page.getByRole("button", { name: "meters", exact: true }).click();

    // Nav rail collapse / expand
    await page.getByRole("button", { name: "Collapse navigation" }).click();
    await expect(page.getByText("GroundX", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Expand navigation" }).click();
    await expect(page.getByText("GroundX", { exact: true })).toBeVisible();

    // Divider keyboard resize updates aria-valuenow
    const divider = page.getByRole("separator", { name: "Resize chat and canvas" });
    const before = Number(await divider.getAttribute("aria-valuenow"));
    await divider.focus();
    await page.keyboard.press("ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", String(before + 16));

    // Focus chat hides the divider; toggling restores it
    await page.getByRole("button", { name: "Focus chat" }).click();
    await expect(page.getByRole("separator", { name: "Resize chat and canvas" })).toHaveCount(0);
    await page.getByRole("button", { name: "Focus chat" }).click();
    await expect(page.getByRole("separator", { name: "Resize chat and canvas" })).toBeVisible();
  });
});
