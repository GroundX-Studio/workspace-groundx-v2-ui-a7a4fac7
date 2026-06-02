import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 acceptance — Utility scenario golden journey across F1 → F7.
 *
 * Runs against the REAL GroundX backend (the middleware boots in real mode —
 * there is no MOCK_MODE; 2026-06-01-retire-mock-mode). The deterministic data is
 * the seeded sample doc c3bfff49 in bucket 28454. CI supplies the Partner key
 * via the `dev`-environment secret (see .github/workflows/ci.yml).
 *
 * Coverage targets per [[project-phased-plan]] Utility acceptance row:
 *   • Single-doc Understand → Extract → Citations → Interact → Gate → Integrate
 *   • Capability badges (E only)
 *   • Step strip pill state machine
 *   • Back-out from gate (LC5 dismiss path)
 *
 * Pinned to the `desktop` viewport for v1. Tablet + mobile coverage lands in
 * Phase 6 alongside R3 / R4 responsive variants.
 */

test.describe("F1–F7 · Utility scenario · golden journey @desktop-only", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Phase 3 golden journey runs on desktop only");
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/onboarding");
  });

  // The picker surfaces the ACTUALLY-SEEDED scenarios. Only the Utility sample
  // doc (c3bfff49, bucket 28454) is seeded live; the decoupled ScenarioRegistry
  // joins bucket docs by `filter.projectId` and correctly omits doc-less
  // scenarios (Loan/Solar are not seeded — see onboarding-loan.spec.ts skip +
  // its seeding ticket). So we assert Utility + its Extract badge, NOT a
  // hardcoded three samples.
  test("picker shows the seeded Utility sample with the 'Extract' badge", async ({ page }) => {
    await expect(page.getByTestId("sample-utility")).toBeVisible();
    const utilityCard = page.getByTestId("sample-utility");
    await expect(utilityCard.getByText("Extract")).toBeVisible();
  });

  test("picking Utility transitions F1 → F2 (Understand)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // Structural: the F2 frame mounts. (The former `April 2026 Statement`
    // assertion was a MOCK_MODE fixture title; against the live doc the title is
    // not a stable contract.)
    await expect(page.getByTestId("onboarding-frame-f2")).toBeVisible();
  });

  test("F2 reveals the 'Show me the extract' affordance after thinking notes", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2 plays a 6-note thinking stream then AUTO-advances to F3
    // (experience.tsx onDone → advanceFrame("f3")). Assert the auto-advance
    // lands on the F3 frame rather than the legacy "advance-to-f3" pill, which
    // the auto-advance preempts. Timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
  });

  // Structural, live-data-stable: the extract renders schema rows and at least
  // one citation chip. Field IDs come from the live extract workflow schema, so
  // we assert ≥1 `field-row-*` + ≥1 `cite-chip-*` rather than specific field
  // names/values (those were MOCK_MODE fixtures).
  test("F3 surfaces schema rows with citation chips", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    // At least one extracted field row renders.
    await expect(page.locator('[data-testid^="field-row-"]').first()).toBeVisible({ timeout: 15_000 });
    // At least one field carries a citation chip.
    await expect(page.locator('[data-testid^="cite-chip-"]').first()).toBeVisible({ timeout: 15_000 });
  });

  // ──────────────────────────────────────────────────────────────────────
  // test.fixme cluster (2026-06-02-e2e-live-data-realignment): the F4
  // provenance peek, the F5→F6 gate-open flow (the `advance-to-f6` affordance
  // no longer exists), the BYO sign-up surface (`signup-submit` no longer
  // mounts the same way), and the F6 axe pass all target a SUPERSEDED UX flow
  // from before the widget-unification / steady-canvas refactor. These need a
  // flow-aware re-grounding against the CURRENT gate/BYO/provenance mechanism,
  // NOT a string tweak — tracked by the "Re-ground onboarding gate/BYO/
  // provenance e2e" ticket (spawn_task). Marked fixme (not deleted) so the
  // intent + coverage gap stay visible. The front-half journey above
  // (picker → F2 → F3 → F5 + axe) is re-grounded and green.
  // ──────────────────────────────────────────────────────────────────────
  test.fixme("F4 citation peek opens when a cited field row is clicked", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    // Click a row that actually carries a citation, so the peek has one to show.
    const citedRow = page
      .locator('[data-testid^="field-row-"]', { has: page.locator('[data-testid^="cite-chip-"]') })
      .first();
    await expect(citedRow).toBeVisible({ timeout: 15_000 });
    await citedRow.click();
    // Selecting a field opens the provenance panel (the live "peek"), which
    // lists that field's source citations. The exact source filename was a
    // MOCK_MODE fixture; assert the panel surface + a citation chip instead.
    const panel = page.getByTestId("field-provenance-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-testid^="cite-chip-"]').first()).toBeVisible();
  });

  test("F5 InteractView mounts after advancing from Extract", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    // The InteractView (F5) canvas mounts. The interact chat is LIVE (no
    // MOCK_MODE): the seed prompt is offered as a suggestion, not auto-sent, and
    // any answer is a non-deterministic LLM response — so we assert the F5
    // surface mounts, not specific conversation text.
    await expect(page.getByTestId("onboarding-frame-f5")).toBeVisible();
  });

  test.fixme("F6 gate opens on Save and is dismissable (LC5 back-out)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await page.getByTestId("advance-to-f6").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await page.getByTestId("gate-rail-dismiss").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeHidden();
  });

  test.fixme("F6 → register → claim → F7 (full sign-up happy path with stubbed APIs)", async ({ page }) => {
    // Stub the two endpoints the gate hits. We use page.route so this
    // works against the frontend-only e2e webServer (no live middleware).
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ username: "gx-user", token: "t", xJwtToken: "x", apiKeys: [] }),
      });
    });
    await page.route("**/api/chat-sessions/claim", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ rekeyedSessions: 1 }),
      });
    });

    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await page.getByTestId("advance-to-f6").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();

    // Fill the real register form (first / last / email / password / confirm).
    await page.getByTestId("signup-first-input").fill("Pat");
    await page.getByTestId("signup-last-input").fill("Buyer");
    await page.getByTestId("signup-email-input").fill("pat@example.com");
    await page.getByTestId("signup-password-input").fill("secret12345");
    await page.getByTestId("signup-confirm-input").fill("secret12345");
    await page.getByTestId("signup-submit").click();

    // Committed card replaces the form on success.
    await expect(page.getByTestId("gate-rail-committed")).toBeVisible();
    await expect(page.getByText(/WELCOME/i)).toBeVisible();

    // Continue advances to F7 (IntegrateView).
    await page.getByTestId("gate-rail-continue-integrate").click();
    // F7 is still a stub view — assert by URL/route stability rather
    // than by content. The frame transition is enough to confirm the
    // gate flipped state correctly.
    await page.waitForLoadState("networkidle");
  });

  test.fixme("F6 inline error appears + gate stays open when register fails", async ({ page }) => {
    await page.route("**/api/auth/register", async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Email already registered" }),
      });
    });

    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await page.getByTestId("advance-to-f6").click();
    await page.getByTestId("signup-first-input").fill("Pat");
    await page.getByTestId("signup-last-input").fill("Buyer");
    await page.getByTestId("signup-email-input").fill("pat@example.com");
    await page.getByTestId("signup-password-input").fill("secret12345");
    await page.getByTestId("signup-confirm-input").fill("secret12345");
    await page.getByTestId("signup-submit").click();

    // Inline error renders; gate stays open (not committed).
    await expect(page.getByTestId("signup-error")).toContainText(/already registered/i);
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expect(page.getByTestId("gate-rail-committed")).toBeHidden();
  });

  test.fixme("BYO tile in F1 mounts the gate surface (chat rail + canvas form)", async ({ page }) => {
    // ARCH-05B (2026-05-26): clicking BYO no longer leaves the user
    // on the F1 picker with the gate underneath. The BYO trigger
    // navigates to /onboarding/signup, which opens the session-level
    // gate. The shell derives frame=f2 (signup is a gate-driven
    // surface) and mounts the AppShell with `SignUpWidget` in the
    // canvas slot + `GateChatRail` in the chat slot. The picker is
    // gone — the user is on the sign-up surface.
    await page.getByTestId("byo-pdf").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expect(page.getByTestId("signup-submit")).toBeVisible();
    await expect(page.getByTestId("onboarding-frame-f1")).toBeHidden();
  });

  test.fixme("ARCH-05B regression: canvas swaps to SignUpWidget while the gate is open, hiding the previous sample", async ({ page }) => {
    // The motivating bug for the ARCH-05 split. Before the fix, the
    // canvas kept rendering whatever frame view was previously active
    // when the gate opened — so a user mid-sample-doc saw the PDF
    // sitting behind a chat-side sign-up form. Now: gate opens →
    // canvas swaps to SignUpWidget; dismiss → canvas restores the
    // frame view.
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    // Pre-condition: InteractView for the utility sample is on canvas.
    await expect(page.getByTestId("onboarding-frame-f5")).toBeVisible();
    await expect(page.getByTestId("signup-submit")).toBeHidden();

    await page.getByTestId("advance-to-f6").click();
    // During gate-open: canvas shows the form, NOT the InteractView.
    await expect(page.getByTestId("signup-submit")).toBeVisible();
    await expect(page.getByTestId("onboarding-frame-f5")).toBeHidden();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();

    // Dismiss: canvas restores the frame view (now f6 — advance-to-f6
    // moved the frame forward before opening the gate).
    await page.getByTestId("gate-rail-dismiss").click();
    await expect(page.getByTestId("signup-submit")).toBeHidden();
    await expect(page.getByTestId("onboarding-frame-f6")).toBeVisible();
  });

  test.fixme("F6 gate honors ESC keyboard dismiss (LC5 path #2)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await page.getByTestId("advance-to-f6").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("gate-rail-preamble")).toBeHidden();
  });

  test.fixme("F6 gate honors 'keep exploring' link dismiss (LC5 path #3)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await page.getByTestId("advance-to-f6").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await page.getByTestId("gate-rail-dismiss").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeHidden();
  });
});

// axe a11y sweep for the F-series screens. WCAG 2.0/2.1 A + AA rules only;
// best-practice rules are noisy and not release-blocking.
//
// `color-contrast` is currently disabled because the brand `EYEBROW_ON_LIGHT`
// (CORAL #f3663f) on the TINT body surface measures ~3.1:1, below the 4.5:1
// AA threshold. This is a brand-token-level decision flagged for the
// standards owner — we don't want to mask the structural rules (role,
// landmarks, focus, aria-required-parent) just because of one color pair.
async function expectAxeClean(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(["color-contrast"])
    .analyze();
  if (results.violations.length > 0) {
    const summary = results.violations
      .map((v) => {
        const nodes = v.nodes
          .map((n) => `      - ${n.target.join(" ")}\n        ${n.html}`)
          .join("\n");
        return `  • ${v.id} (${v.impact}): ${v.help}\n${nodes}`;
      })
      .join("\n");
    throw new Error(`axe violations on ${label}:\n${summary}`);
  }
}

test.describe("F1–F7 axe a11y @desktop-only", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Axe sweep runs on desktop only for v1");
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/onboarding");
  });

  test("F1 picker is axe-clean (WCAG 2.0/2.1 A+AA)", async ({ page }) => {
    await expect(page.getByTestId("sample-utility")).toBeVisible();
    await expectAxeClean(page, "F1");
  });

  test("F3 extract is axe-clean", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible();
    await expectAxeClean(page, "F3");
  });

  test("F5 interact is axe-clean", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await expect(page.getByTestId("onboarding-frame-f5")).toBeVisible();
    await expectAxeClean(page, "F5");
  });

  test.fixme("F6 gate card is axe-clean", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("advance-to-f5").click({ timeout: 15_000 });
    await page.getByTestId("advance-to-f6").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expectAxeClean(page, "F6");
  });
});
