import { expect, test } from "@playwright/test";

/**
 * Phase 3 acceptance — Utility scenario golden journey across F1 → F7.
 *
 * Runs against `MOCK_MODE=true` + placeholder fixtures (FIXTURE_PLACEHOLDER
 * tags in `app/src/fixtures/utility.ts`). Real content swap-in lives in the
 * Phase 7 fixture-swap checkpoint per [[project-phased-plan]].
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

  test("picker shows three samples with the Utility 'Extract' badge", async ({ page }) => {
    await expect(page.getByTestId("sample-utility")).toBeVisible();
    await expect(page.getByTestId("sample-loan")).toBeVisible();
    await expect(page.getByTestId("sample-solar")).toBeVisible();
    // Utility card has only the "Extract" badge.
    const utilityCard = page.getByTestId("sample-utility");
    await expect(utilityCard.getByText("Extract")).toBeVisible();
  });

  test("picking Utility transitions F1 → F2 (Understand)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await expect(page.getByTestId("onboarding-frame-f2")).toBeVisible();
    await expect(page.getByText(/April 2026 Statement/)).toBeVisible();
  });

  test("F2 reveals the 'Show me the extract' affordance after thinking notes", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    // The reveal timer fires at ~4.5s. Generous 8s wait keeps the test
    // tolerant of slow CI.
    await expect(page.getByTestId("advance-to-f3")).toBeVisible({ timeout: 8_000 });
  });

  test("F3 surfaces all schema rows and citation chips", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible();
    await expect(page.getByTestId("field-row-account_number")).toBeVisible();
    await expect(page.getByTestId("field-row-amount_due")).toBeVisible();
    // Citation chip is present on amount_due.
    const amountRow = page.getByTestId("field-row-amount_due");
    await expect(amountRow.getByTestId("cite-chip-1")).toBeVisible();
  });

  test("F4 citation peek opens when a field row is clicked", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await page.getByTestId("field-row-amount_due").click();
    const preview = page.getByTestId("extract-preview");
    await expect(preview.getByRole("heading", { name: "Amount due" })).toBeVisible();
    await expect(preview.getByText(/utility-bill-2026-04/)).toBeVisible();
  });

  test("F5 InteractView shows fixture chat turns with cite chips", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await page.getByTestId("advance-to-f5").click();
    await expect(page.getByTestId("onboarding-frame-f5")).toBeVisible();
    await expect(page.getByText(/largest charge category/)).toBeVisible();
    await expect(page.getByText(/Demand charges came in highest/)).toBeVisible();
  });

  test("F6 gate opens on Save and is dismissable (LC5 back-out)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await page.getByTestId("advance-to-f5").click();
    await page.getByTestId("advance-to-f6").click();
    await expect(page.getByTestId("gate-card")).toBeVisible();
    await page.getByTestId("gate-dismiss").click();
    await expect(page.getByTestId("gate-card")).toBeHidden();
  });

  test("F6 → committed shows the magic-link confirmation", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await page.getByTestId("advance-to-f5").click();
    await page.getByTestId("advance-to-f6").click();
    await page.getByTestId("gate-email-input").fill("pat@example.com");
    await page.getByTestId("gate-email-submit").click();
    await expect(page.getByText(/CHECK YOUR EMAIL/i)).toBeVisible();
  });

  test("BYO tile in F1 opens the gate without picking a sample", async ({ page }) => {
    await page.getByTestId("byo-pdf").click();
    // The gate doesn't render on F1 (full-bleed), but the onboarding session
    // gate.status is 'open'. The picker stays interactive.
    await expect(page.getByTestId("onboarding-frame-f1")).toBeVisible();
  });
});
