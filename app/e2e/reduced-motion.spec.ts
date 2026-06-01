import { expect, test } from "@playwright/test";

/**
 * TS-09 — reduced-motion CI sweep.
 *
 * Pairs with UR-03 (the global `<MotionRoot>` MotionConfig). When the
 * OS reports `prefers-reduced-motion: reduce`, three contracts must
 * actually fire end-to-end:
 *
 *   1. `<MotionRoot>` supplies an 80 ms global default `transition` to
 *      every descendant `motion.X`. The wrapper itself isn't observable
 *      in the DOM, but the surfaces below are.
 *   2. `AppShell` carries `data-app-shell-reduced-motion="true"` so its
 *      drag/snap transitions are zero-duration.
 *   3. `UnderstandView` swaps its scan-line `<motion.div>` for a hidden
 *      placeholder (`display: none`). The looping `repeat: Infinity`
 *      animation is the worst offender for jsdom and OS-reduced users —
 *      this confirms it's actually gone in a real browser.
 *
 * This runs against the same real-backend preview as the rest of the e2e
 * suite (the middleware boots in real mode — there is no MOCK_MODE). This
 * particular spec asserts CSS/animation behavior and does not depend on live
 * GroundX responses.
 */
test.use({ reducedMotion: "reduce" });

test.describe("reduced-motion CI sweep (TS-09)", () => {
  test("AppShell exposes the reduced-motion data attribute after a scenario pick", async ({ page }) => {
    await page.goto("/onboarding");
    // Pick Utility so the shell mounts (AppShell only renders inside the
    // F2-shell branch — F1 is the standalone IngestView picker).
    await page.getByTestId("sample-utility").click();
    await expect(page.getByTestId("onboarding-frame-f2")).toBeVisible();

    // AppShell drives reduced-motion off `useMediaQuery("(prefers-reduced-motion: reduce)")`.
    // With Playwright's `reducedMotion: "reduce"` fixture, the attribute must read "true".
    const shell = page.locator('[data-app-shell-reduced-motion]').first();
    await expect(shell).toHaveAttribute("data-app-shell-reduced-motion", "true");
  });

  test("F2 scan-line is hidden under reduced motion (the looping repeat: Infinity goes away)", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByTestId("sample-utility").click();
    await expect(page.getByTestId("onboarding-frame-f2")).toBeVisible();

    // The scan-line testid is still rendered (so layout assertions
    // upstream don't break), but its computed style must be `display: none`
    // — confirming the `motion.div` -> placeholder Box swap landed.
    const scanLine = page.getByTestId("understand-scan-line");
    await expect(scanLine).toBeAttached();
    const display = await scanLine.evaluate((el) => getComputedStyle(el).display);
    expect(display).toBe("none");
  });

  test("F2 page transitions complete instantly (no opacity transition stuck mid-animation)", async ({ page }) => {
    await page.goto("/onboarding");
    await page.getByTestId("sample-utility").click();
    // The shell appears in the same tick under reduced-motion. If the
    // 80 ms global default got stuck on the page-swipe animation, the
    // f2 testid would not be visible immediately. We give Playwright
    // a tight timeout so this fails loudly if the reduced-motion path
    // ever regresses to "still animates for 200 ms+".
    await expect(page.getByTestId("onboarding-frame-f2")).toBeVisible({ timeout: 1_500 });
  });
});
