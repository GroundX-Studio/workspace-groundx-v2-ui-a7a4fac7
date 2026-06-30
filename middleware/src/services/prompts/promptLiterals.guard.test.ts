/**
 * chat-architecture-hardening Task 2 — prompt-literal drift guard.
 *
 * Every model-facing prompt literal must live in
 * `middleware/src/services/prompts/`. A service file that inlines prompt
 * text bypasses the single-source prompts module and reintroduces the
 * drift this change removed (the VOICE rule existed twice and had already
 * diverged when this guard landed).
 *
 * EXCLUSIONS:
 *  - `prompts/` itself (the literals' home).
 *  - `*.test.ts` (tests assert against prompt substrings on purpose).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVICES_DIR = join(HERE, "..");

/** Sentinel literals — one per model-facing prompt. */
const PROMPT_LITERALS = [
  "VOICE: never expose your internal materials",
  "You are the user's analyst",
  "You are a field extractor",
  "You are a conversation summarizer",
  "You are merging older conversation summaries",
  "You classify ONE user message",
  "TOOL NOTES (how to use the tools",
] as const;

/** No exclusions — the Task-2 `structuredHandler.ts` carve-out died with
 * `HYBRID_SYSTEM_PROMPT` in Task 3. */
const TEMPORARY_EXCLUSIONS = new Set<string>();

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "prompts") continue; // the literals' home
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    if (TEMPORARY_EXCLUSIONS.has(entry)) continue;
    out.push(full);
  }
  return out;
}

describe("prompt-literal drift guard", () => {
  it("no model-facing prompt literal exists outside services/prompts/", () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SERVICES_DIR)) {
      const text = readFileSync(file, "utf8");
      for (const literal of PROMPT_LITERALS) {
        if (text.includes(literal)) {
          offenders.push(`${relative(SERVICES_DIR, file)}: "${literal}"`);
        }
      }
    }
    expect(
      offenders,
      `prompt literals found outside services/prompts/ — move them into the prompts module:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  // Heuristic sweep for BRAND-NEW inline prompts (post-review hardening):
  // the sentinel list above only catches re-inlining the KNOWN prompts. A
  // system message whose content is an inline string literal (rather than a
  // builder-provided variable) is a new prompt being born outside the
  // module. Builder call sites pass identifiers ({ role: "system", content:
  // system }) and don't match.
  it("no inline system-message string literal exists outside services/prompts/", () => {
    const offenders: string[] = [];
    const inlineSystem = /role:\s*"system",\s*content:\s*["'`]/;
    for (const file of collectSourceFiles(SERVICES_DIR)) {
      const text = readFileSync(file, "utf8");
      if (inlineSystem.test(text)) {
        offenders.push(relative(SERVICES_DIR, file));
      }
    }
    expect(
      offenders,
      `inline system-prompt literals found outside services/prompts/ — build them in the prompts module:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
