import { expect, test } from "@playwright/test";

/**
 * Phase 4 acceptance — Loan Eligibility scenario golden journey.
 *
 * Loan exercises the multi-doc + multi-citation + JSON-render path:
 *   • 12-document packet (paystubs, W-2, bank statements, employment letter, ...)
 *   • Income / Debt / Anomalies categories
 *   • Workflow handoff demo via the Table ↔ JSON render toggle
 *   • Cross-doc citations (gross_monthly_income references 4 paystubs)
 *
 * Desktop-only per D3.1 — tablet + mobile lands in Phase 6.
 */

test.describe("F1–F7 · Loan Eligibility scenario · golden journey @desktop-only", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Phase 4 golden journey runs on desktop only");
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/onboarding");
  });

  test("Loan card shows Extract + Interact badges", async ({ page }) => {
    const loanCard = page.getByTestId("sample-loan");
    await expect(loanCard).toBeVisible();
    await expect(loanCard.getByText("Extract")).toBeVisible();
    await expect(loanCard.getByText("Interact")).toBeVisible();
  });

  test("picking Loan transitions F1 → F2 with the first doc title", async ({ page }) => {
    await page.getByTestId("sample-loan").click();
    await expect(page.getByTestId("onboarding-frame-f2")).toBeVisible();
    await expect(page.getByText(/Paystub Mar 14/)).toBeVisible();
  });

  test("F3 renders Income / Debt / Anomalies categories", async ({ page }) => {
    await page.getByTestId("sample-loan").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await expect(page.getByTestId("onboarding-frame-f3")).toBeVisible();
    // Category cards expose their name via aria-label; using the label query
    // sidesteps the ARIA role question (a flat Card is not a "region").
    await expect(page.getByLabel("Income", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Debt", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Anomalies", { exact: true })).toBeVisible();
  });

  test("gross_monthly_income field carries 4 cross-doc citation chips", async ({ page }) => {
    await page.getByTestId("sample-loan").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    const row = page.getByTestId("field-row-gross_monthly_income");
    await expect(row.getByTestId("cite-chip-1")).toBeVisible();
    await expect(row.getByTestId("cite-chip-4")).toBeVisible();
  });

  test("citation peek shows all 4 source paystubs", async ({ page }) => {
    await page.getByTestId("sample-loan").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await page.getByTestId("field-row-gross_monthly_income").click();
    const preview = page.getByTestId("extract-preview");
    await expect(preview.getByRole("heading", { name: "Gross monthly income" })).toBeVisible();
    await expect(preview.getByText("loan-doc-1 · page 1")).toBeVisible();
    await expect(preview.getByText("loan-doc-4 · page 1")).toBeVisible();
  });

  test("render-mode toggle switches Table ↔ JSON (workflow handoff demo)", async ({ page }) => {
    await page.getByTestId("sample-loan").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await expect(page.getByTestId("render-mode-tabs")).toBeVisible();
    // Default is Table — JSON block not shown.
    await expect(page.getByTestId("extract-json")).toBeHidden();
    await page.getByTestId("render-mode-json").click();
    await expect(page.getByTestId("extract-json")).toBeVisible();
    await expect(page.getByTestId("extract-json")).toContainText("loan-schema-v1");
    // Switch back.
    await page.getByTestId("render-mode-table").click();
    await expect(page.getByTestId("extract-json")).toBeHidden();
  });

  test("F5 InteractView replays Loan DTI question", async ({ page }) => {
    await page.getByTestId("sample-loan").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await page.getByTestId("advance-to-f5").click();
    await expect(page.getByText(/35% DTI threshold/)).toBeVisible();
    await expect(page.getByText(/Estimated DTI is 22%/)).toBeVisible();
  });

  test("Loan render-mode toggle does NOT appear on Utility (utility has no JSON mode)", async ({ page }) => {
    await page.getByTestId("sample-utility").click();
    await page.getByTestId("advance-to-f3").click({ timeout: 8_000 });
    await expect(page.getByTestId("render-mode-tabs")).toBeHidden();
  });
});
