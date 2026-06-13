/**
 * GateChatPanel legacy placement guard.
 *
 * GateChatPanel was the old chat-side sign-in surface. Sign-in now renders as
 * a viewer widget while ChatColumn keeps ConversationFlow mounted. The legacy
 * component may still exist for archived/demo references, but it must not be
 * imported by the live onboarding shell or chat column.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

describe("GateChatPanel legacy placement", () => {
  it("does not leave a stale copy in views/", () => {
    const legacyHome = resolve(SRC, "components/chat-widgets/GateChatPanel/GateChatPanel.tsx");
    const oldHome = resolve(SRC, "views/Onboarding/GateChatPanel.tsx");
    expect(
      existsSync(legacyHome),
      `expected the archived GateChatPanel component to remain at ${legacyHome}`,
    ).toBe(true);
    expect(
      existsSync(oldHome),
      `stale GateChatPanel still at ${oldHome}`,
    ).toBe(false);
  });

  it("live chat/view shells do not import GateChatPanel", () => {
    const chatColumn = resolve(SRC, "components/chat-widgets/ChatColumn/ChatColumn.tsx");
    const onboardingShell = resolve(SRC, "views/Onboarding/OnboardingShell.tsx");
    const src = `${readFileSync(chatColumn, "utf8")}\n${readFileSync(onboardingShell, "utf8")}`;
    expect(
      /import\s*\{[^}]*\bGateChatPanel\b[^}]*\}\s*from\s*["']@\/components\/chat-widgets\/GateChatPanel\//.test(src),
      "GateChatPanel must not be imported by the live chat/view shells",
    ).toBe(false);
    expect(
      /import\s*\{[^}]*\bGateChatPanel\b[^}]*\}\s*from\s*["']@\/views\//.test(src),
      "GateChatPanel must not be imported from @/views/ (widget -> view inversion)",
    ).toBe(false);
  });
});
