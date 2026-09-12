import { expect, test } from "@playwright/test";

/**
 * chat-message-actions-timestamps — per-message footer + SuggestedActionChips
 * behaviors that jsdom cannot measure (computed opacity for the hover-reveal /
 * touch-persistent path, and single-line ellipsis truncation which needs real
 * layout). Runs against the real app like the other onboarding specs.
 *
 * Determinism: sending a message renders the USER turn OPTIMISTICALLY (no LLM
 * needed for the footer assertions). The chip layout test supplies the server's
 * typed response at the HTTP boundary because live model tool selection is not
 * a stable layout-test precondition.
 */

const TIME_RE = /\d{1,2}:\d{2}\s?(AM|PM)/i;
const userFooter = '[data-testid="message-actions"][data-role="user"]';

async function stubBookCallReply(page: import("@playwright/test").Page) {
  await page.route("**/api/chat/messages", async (route) => {
    const result = {
      userMessageId: "e2e-user-message",
      assistantMessageId: "e2e-assistant-message",
      reply: {
        mode: "rag",
        answer: "You can book a call with an engineer.",
        citations: [],
        suggestedActions: [
          {
            key: "tool:book_call",
            label: "Book a call",
            detail: { name: "book_call", arguments: {}, intent: { kind: "openBookCall" } },
          },
        ],
        intents: [],
        toolFailures: [],
        toolActivity: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    };
    await route.fulfill({
      body: `id: 1\nevent: envelope\ndata: ${JSON.stringify(result)}\n\n`,
      contentType: "text/event-stream",
      status: 200,
    });
  });
}

async function sendFirstMessage(page: import("@playwright/test").Page, text: string) {
  await page.goto("/onboarding/28454/utility");
  const input = page.getByRole("textbox", { name: /chat input/i });
  await expect(input).toBeVisible({ timeout: 20_000 });
  await input.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("chat-live-user").filter({ hasText: text })).toBeVisible();
}

test.describe("per-message footer — hover-reveal @desktop", () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "hover-reveal asserts the hover-capable path");
  });

  test("user footer: hidden at rest, revealed on hover, right-aligned, copy + timestamp", async ({ page }) => {
    await sendFirstMessage(page, "hello there");
    const footer = page.locator(userFooter);
    await expect(footer).toHaveCount(1);
    await expect(footer).toHaveCSS("justify-content", "flex-end");
    await expect(footer.getByTestId("copy-message-button")).toBeAttached();
    await expect(footer).toContainText(TIME_RE);
    // Hidden at rest on a hover-capable device; revealed when the turn is hovered.
    await expect(footer).toHaveCSS("opacity", "0");
    await page.getByTestId("chat-live-user").filter({ hasText: "hello there" }).hover();
    await expect(footer).toHaveCSS("opacity", "1");
  });

  test("a booking ask surfaces a single-line, in-width, left-aligned 'Book a call' chip that truncates a long label", async ({
    page,
  }) => {
    await stubBookCallReply(page);
    await sendFirstMessage(page, "can i book a call with a human please");
    const chip = page.getByTestId("suggested-action-chip-tool:book_call");
    await expect(chip).toBeVisible({ timeout: 30_000 });
    const bubble = page.getByTestId("chat-live-assistant").last();

    const single = await chip.evaluate((el) => el.getBoundingClientRect().height);
    const bubbleRight = await bubble.evaluate((el) => el.getBoundingClientRect().right);
    const chipRight = await chip.evaluate((el) => el.getBoundingClientRect().right);
    expect(single).toBeLessThanOrEqual(30); // compact single-line pill
    expect(chipRight).toBeLessThanOrEqual(bubbleRight + 1); // does not stretch past the bubble
    await expect(chip).toHaveCSS("text-transform", "uppercase");

    // Force a pathologically long label and confirm it stays a single line and
    // never overflows the pane (ellipsis engages) — the synthetic case the
    // in-code flex-child comment guards.
    const long =
      "Open the Calendly booking surface for a 30-minute engineer call with a solutions team member";
    const metrics = await chip.evaluate((el, text) => {
      const span = el.querySelector("span") ?? el;
      span.textContent = text;
      const pane = el.closest('[aria-label="Chat pane"]') ?? document.body;
      const r = el.getBoundingClientRect();
      return {
        height: r.height,
        withinPane: r.right <= pane.getBoundingClientRect().right + 1,
        clipped: span.scrollWidth > span.clientWidth,
      };
    }, long);
    expect(metrics.height).toBeLessThanOrEqual(30); // still one line
    expect(metrics.withinPane).toBe(true); // no horizontal overflow
    expect(metrics.clipped).toBe(true); // ellipsis engaged
  });
});

test.describe("per-message footer — persistent on touch", () => {
  test.use({ isMobile: true, hasTouch: true });
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "touch-persistent asserts the no-hover path");
  });

  test("footer is persistently visible without any hover on a touch device", async ({ page }) => {
    await sendFirstMessage(page, "hello there");
    const footer = page.locator(userFooter);
    await expect(footer).toHaveCount(1);
    // No hover interaction — `@media (hover: none)` keeps the footer visible.
    await expect(footer).toHaveCSS("opacity", "1");
  });
});
