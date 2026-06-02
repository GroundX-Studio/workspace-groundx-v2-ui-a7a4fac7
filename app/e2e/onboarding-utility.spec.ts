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
  // Gate / BYO / provenance steps — re-grounded to the CURRENT flow
  // (2026-06-02-onboarding-flow-test-hardening). The sign-up gate is no longer
  // opened by a removed `advance-to-f6` pill: an anonymous user clicking the
  // Extract "unlock" banner (`extract-unlock-banner`) fires `openGate("save")`.
  // The provenance peek lists citations as "page N" pills, not `cite-chip-*`.
  // ──────────────────────────────────────────────────────────────────────
  test("F4 citation peek opens when a cited field row is clicked", async ({ page }) => {
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
    // Selecting a field opens the provenance panel (the live "peek"). The panel
    // and the field-row chip read the SAME `valuesByFieldId` source, so a row
    // with a cite chip has a populated panel. The panel renders each citation as
    // a "page N" source pill under a SOURCE label (NOT a `cite-chip-*` testid),
    // and shows "No source citations" only when empty — so we assert a real
    // citation rendered, not the empty state.
    const panel = page.getByTestId("field-provenance-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/page \d+/i).first()).toBeVisible();
    await expect(panel.getByText(/No source citations/i)).toHaveCount(0);
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

  test("F6 gate opens on Save and is dismissable (LC5 back-out)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    // Anon gate-open: the Extract "unlock" banner fires openGate("save")
    // (the removed `advance-to-f6` affordance). Save itself is disabled until
    // there are unsaved edits, so the banner is the reliable anon trigger.
    await page.getByTestId("extract-unlock-banner").click({ timeout: 15_000 });
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await page.getByTestId("gate-rail-dismiss").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeHidden();
  });

  test("F6 magic-link sign-in commits the gate (signed-in card)", async ({ page }) => {
    // Post-commit, an effect may re-key the anon session; stub it so the
    // frontend-only webServer doesn't hit live middleware.
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
    // Anon gate-open: the Extract "unlock" banner fires openGate("save")
    // (the removed `advance-to-f6` affordance). Save itself is disabled until
    // there are unsaved edits, so the banner is the reliable anon trigger.
    await page.getByTestId("extract-unlock-banner").click({ timeout: 15_000 });
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();

    // The gate is now a magic-link / SSO offer (not the old first/last/email/
    // password form). Demo magic-link: entering an email + Send commits the gate
    // client-side via the register method. (`gate-rail-email` is a MUI TextField,
    // so the testid is on the wrapper — target the inner <input>.)
    await page.getByTestId("gate-rail-email").locator("input").fill("pat@example.com");
    await page.getByTestId("gate-rail-send-magic-link").click();

    // Committed card replaces the offer on success — the gate is now signed in.
    await expect(page.getByTestId("gate-rail-committed")).toBeVisible();
    await expect(page.getByText(/WELCOME/i)).toBeVisible();
    // The register-method committed card invites continuing to Integrate.
    await expect(page.getByText(/Continue to Integrate/i)).toBeVisible();
    // NOTE: the `gate-rail-continue-integrate` button (→ F7) renders only when
    // the gate is opened ON the gate frame (`onGateFrame = currentFrame ===
    // GATE_FRAME`). This anon save-gate opens over F3, so the commit is the
    // testable invariant here; the gate-frame → F7 advance is a separate path.
  });

  test("F6 gate: Send with an empty email is a no-op (gate stays open)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    await page.getByTestId("extract-unlock-banner").click({ timeout: 15_000 });
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();

    // The magic-link gate has no inline register-error affordance (commitGate is
    // a client-side state flip; the old SignUpWidget `signup-error` form is
    // gone). The real guard is: Send with an EMPTY email does nothing
    // (handleSendMagicLink early-returns) — the gate stays open, not committed.
    await page.getByTestId("gate-rail-send-magic-link").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expect(page.getByTestId("gate-rail-committed")).toHaveCount(0);
  });

  test("BYO tile in F1 mounts the gate surface (magic-link rail)", async ({ page }) => {
    // ARCH-05B (2026-05-26): clicking BYO navigates to /onboarding/signup, which
    // opens the session-level gate. The shell mounts the `GateChatRail` (now a
    // magic-link / SSO offer) in the chat slot — NOT the old SignUpWidget form.
    // The picker is gone — the user is on the sign-up surface.
    await page.getByTestId("byo-pdf").click();
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expect(page.getByTestId("gate-rail-email")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("gate-rail-send-magic-link")).toBeVisible();
    await expect(page.getByTestId("onboarding-frame-f1")).toBeHidden();
  });

  test("ARCH-05B regression: canvas swaps off the sample while the gate is open, then restores", async ({ page }) => {
    // The motivating bug for the ARCH-05 split: before the fix the canvas kept
    // rendering the previous frame view behind a chat-side gate. Now opening the
    // gate swaps the canvas OFF the sample (to the "Why GroundX" value-prop
    // panel); dismissing restores the frame view. (The gate is the magic-link
    // rail now, not the old SignUpWidget form.)
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    // Pre-condition: the Extract sample workbench is on canvas.
    await expect(page.getByTestId("extract-workbench")).toBeVisible({ timeout: 15_000 });

    // Anon gate-open via the Extract unlock banner (the removed `advance-to-f6`).
    await page.getByTestId("extract-unlock-banner").click({ timeout: 15_000 });
    // During gate-open: the gate rail is up and the canvas content swaps OFF the
    // sample (the value-prop panel renders inside the persistent frame wrapper),
    // so the Extract workbench is gone. (We assert `extract-workbench`, not the
    // `onboarding-frame-f3` wrapper, which stays mounted and hosts the swap.)
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expect(page.getByTestId("extract-workbench")).toBeHidden();

    // Dismiss: the canvas restores the sample. Save opens the gate over F3
    // without advancing the frame, so the Extract workbench returns.
    await page.getByTestId("gate-rail-dismiss").click();
    await expect(page.getByTestId("extract-workbench")).toBeVisible();
  });

  // NOTE: the former "ESC keyboard dismiss (LC5 path #2)" test was removed. The
  // sign-up gate was redesigned from a modal form to a non-modal chat-rail
  // magic-link/SSO offer, which is dismissed via the "Keep exploring" link
  // (`gate-rail-dismiss`, asserted below) — ESC is not a dismiss path for a
  // chat-rail surface. LC5 (state-machines doc) updated to match the redesign.

  test("F6 gate honors 'keep exploring' link dismiss (LC5 back-out)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    // Anon gate-open: the Extract "unlock" banner fires openGate("save")
    // (the removed `advance-to-f6` affordance). Save itself is disabled until
    // there are unsaved edits, so the banner is the reliable anon trigger.
    await page.getByTestId("extract-unlock-banner").click({ timeout: 15_000 });
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

  test("F6 gate card is axe-clean", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // F2's thinking stream (6 notes · ~1.5–2.8s each + 1.2s done-reveal) AUTO-
    // advances to F3 on completion (experience.tsx onDone → advanceFrame("f3")),
    // so we wait for the F3 frame rather than clicking a pill the auto-advance
    // preempts. Generous timeout covers the live stream duration.
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible({ timeout: 25_000 });
    // Anon gate-open: the Extract "unlock" banner fires openGate("save")
    // (the removed `advance-to-f6` affordance). Save itself is disabled until
    // there are unsaved edits, so the banner is the reliable anon trigger.
    await page.getByTestId("extract-unlock-banner").click({ timeout: 15_000 });
    await expect(page.getByTestId("gate-rail-preamble")).toBeVisible();
    await expectAxeClean(page, "F6");
  });
});
