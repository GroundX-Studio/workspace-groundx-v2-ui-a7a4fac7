/**
 * GateChatPanel placement guard (2026-05-31-dependency-direction-guard Phase 1).
 *
 * GateChatPanel is a pure chat-side composite (gate-status dispatch →
 * IdleChatPlaceholder / TypingIndicator / GateChatRail). It mounts a
 * chat-widget (GateChatRail) and is mounted BY a chat-widget (ChatColumn).
 * It therefore belongs in the chat-widget slot, NOT in views/Onboarding/.
 *
 * This test asserts the untangle:
 *   1. The composite lives at components/chat-widgets/GateChatPanel/GateChatPanel.tsx.
 *   2. No stale copy remains under views/Onboarding/.
 *   3. ChatColumn imports GateChatPanel from the chat-widget slot, not from @/views/.
 *
 * It is RED against today's tree (the file is in views/ and ChatColumn
 * imports `@/views/Onboarding/GateChatPanel`) and goes GREEN once Phase 1
 * lands. The broader rule-5 dependency-direction assertion (Phase 2) in
 * widget-contract.test.ts generalizes this for ALL widgets.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "..");

describe("GateChatPanel placement (Phase 1 untangle)", () => {
  it("lives in the chat-widget slot, not in views/", () => {
    const moved = resolve(SRC, "components/chat-widgets/GateChatPanel/GateChatPanel.tsx");
    const oldHome = resolve(SRC, "views/Onboarding/GateChatPanel.tsx");
    expect(
      existsSync(moved),
      `expected GateChatPanel at ${moved} (it is a chat composite, not a view)`,
    ).toBe(true);
    expect(
      existsSync(oldHome),
      `stale GateChatPanel still at ${oldHome} — remove it after the move`,
    ).toBe(false);
  });

  it("ChatColumn imports GateChatPanel from the chat-widget slot, NOT from @/views/", () => {
    const chatColumn = resolve(SRC, "components/chat-widgets/ChatColumn/ChatColumn.tsx");
    const src = readFileSync(chatColumn, "utf8");
    expect(
      /import\s*\{[^}]*\bGateChatPanel\b[^}]*\}\s*from\s*["']@\/components\/chat-widgets\/GateChatPanel\//.test(
        src,
      ),
      "ChatColumn must import GateChatPanel from @/components/chat-widgets/GateChatPanel/",
    ).toBe(true);
    expect(
      /import\s*\{[^}]*\bGateChatPanel\b[^}]*\}\s*from\s*["']@\/views\//.test(src),
      "ChatColumn must NOT import GateChatPanel from @/views/ (widget → view inversion)",
    ).toBe(false);
  });
});
