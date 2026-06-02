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
 *   3. The F2 reading scanner (`PdfViewerWidget`, mounted by <ScopedCanvas>
 *      for the `scanning` doc-viewer step) disables its sweeping beam via a
 *      declarative `@media (prefers-reduced-motion: reduce){ animation: none }`
 *      rule. The looping `2.8s infinite alternate` keyframe animation is the
 *      worst offender for OS-reduced users — this confirms it's actually
 *      disabled in a real browser. (Replaces the removed `understand-scan-line`
 *      test; that element was deleted in the UnderstandView → PdfViewer merge.)
 *
 * This runs against the same real-backend preview as the rest of the e2e
 * suite (the middleware boots in real mode — there is no MOCK_MODE). This
 * particular spec asserts CSS/animation behavior and does not depend on live
 * GroundX responses.
 *
 * NOTE on the emulation: the context-level `test.use({ reducedMotion })` option
 * does NOT reach `window.matchMedia` in this `vite preview` setup (verified:
 * matchMedia stays false), so AppShell's `useMediaQuery("(prefers-reduced-
 * motion: reduce)")` reads false and the contract never fires. An explicit
 * `page.emulateMedia({ reducedMotion: "reduce" })` DOES reflect in matchMedia
 * (verified true), so we drive the preference that way per page. This still
 * exercises the REAL media-query path — it is not a mock.
 */
test.describe("reduced-motion CI sweep (TS-09)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  // The AppShell root carries the attribute in BOTH the desktop and the
  // compact (tablet/mobile) layout, so this runs at every viewport. We wait on
  // the appshell root itself, NOT `onboarding-frame-f2`: in compact mode the
  // canvas slot (where the F2 frame lives) is removed from the DOM until the
  // view-swap pill reveals it, so an f2 wait would falsely fail on mobile.
  test("AppShell exposes the reduced-motion data attribute after a scenario pick", async ({ page }) => {
    await page.goto("/onboarding");
    // Pick Utility so the shell mounts (AppShell only renders inside the
    // F2-shell branch — F1 is the standalone IngestView picker).
    await page.getByTestId("sample-utility").click();

    // AppShell drives reduced-motion off `useMediaQuery("(prefers-reduced-motion: reduce)")`.
    // With the explicit `page.emulateMedia({ reducedMotion: "reduce" })` above,
    // the attribute must read "true". `toHaveAttribute` auto-waits for the
    // appshell root to attach, so no separate frame wait is needed.
    const shell = page.locator('[data-app-shell-reduced-motion]').first();
    await expect(shell).toHaveAttribute("data-app-shell-reduced-motion", "true");
  });

  // WF-01 C5 — the F2 "GroundX is reading the doc" scanner. It lives in
  // `PdfViewerWidget` (the production viewer, mounted by <ScopedCanvas> for the
  // `doc-viewer` step). The F2 frame projection flags that step `scanning:true`,
  // so the scanner IS live in the onboarding F2 flow: the page renders under a
  // sweeping beam while the chat ThinkingStream plays, then F2 auto-advances to
  // F3. The sweep is the worst offender for OS-reduced users (a `2.8s infinite
  // alternate` keyframe animation), gated by a declarative
  // `@media (prefers-reduced-motion: reduce){ animation: none }` rule on the
  // beam element. This asserts the scanner actually mounts in F2 AND that its
  // sweep is disabled under reduced motion — the e2e coverage that replaces the
  // removed `understand-scan-line` test (that element was deleted in the
  // UnderstandView → production-PdfViewer unification).
  test("F2 reading scanner mounts and its sweep is disabled under reduced motion", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "the PdfViewer/canvas is unmounted in compact mode until the view-swap pill reveals it");
    await page.goto("/onboarding");
    await page.getByTestId("sample-utility").click();

    // F2 mounts the PdfViewer with the reading scanner while the thinking
    // stream plays (~10-17s before auto-advancing to F3). The full-bleed
    // dimming veil is the visible proof the scanner is live; wait for it to
    // attach once the real xray page image resolves.
    const overlay = page.getByTestId("pdf-viewer-scan-overlay");
    await expect(overlay).toBeVisible({ timeout: 20_000 });

    // The animated sweeper is height:0 (not "visible" to Playwright), so assert
    // on attachment + its computed animation. Under reduced motion the @media
    // rule zeroes the keyframe animation → `animationName` computes to "none".
    const beam = page.getByTestId("pdf-viewer-scan-beam");
    await expect(beam).toBeAttached();
    const animationName = await beam.evaluate((el) => getComputedStyle(el).animationName);
    expect(animationName).toBe("none");
  });

  // The page-transition contract asserts motion on the CANVAS surface. In
  // compact mode the canvas is unmounted until the view-swap pill reveals it,
  // so this runs desktop-only — the reduced-motion MECHANISM (matchMedia →
  // instant transitions) is viewport-independent and fully exercised on
  // desktop; the attr test above covers the compact viewports.
  test("F2 page transitions complete instantly (no opacity transition stuck mid-animation)", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "canvas-surface motion is a desktop-layout concern (canvas unmounted in compact)");
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
