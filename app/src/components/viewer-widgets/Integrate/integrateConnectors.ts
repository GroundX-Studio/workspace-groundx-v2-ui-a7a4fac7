/**
 * Integrate — connector catalog + API snippet data
 * (2026-05-30-onboarding-shell-shared-view Phase 3b).
 *
 * Lifted out of `Integrate.tsx` so the component file carries no string that
 * trips the widget-contract raw-id-prop guard (the TypeScript snippet contains
 * `projectId:`, which the guard's `/\b(?:documentId|bucketId|projectId)\s*\??\s*:/`
 * regex would otherwise flag as a raw id PROP on the widget). These are SDK
 * usage examples + the agent-plugin list — pure data, no React, no props.
 */

/** API usage snippets keyed by language tab. */
export const CODE_FOR: Record<string, string> = {
  curl: `curl -X POST https://api.groundx.ai/api/v1/search/<projectId> \\
  -H "X-API-Key: $YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "What was the largest charge category?" }'`,
  python: `from groundx import GroundX
g = GroundX(api_key="$YOUR_KEY")
r = g.search.content(project_id=PROJECT, query="What was the largest charge category?")
print(r.results[0].text)`,
  typescript: `import { GroundX } from "groundx";
const g = new GroundX({ apiKey: process.env.GROUNDX_API_KEY });
const r = await g.search.content({ projectId: PROJECT, query: "..." });`,
};

/** The agent-plugin connector cards (Claude / OpenAI / Gemini / Cursor). */
export const PLUGINS: ReadonlyArray<{ id: string; label: string; desc: string }> = [
  { id: "claude", label: "Claude", desc: "Add GroundX as a Claude tool" },
  { id: "openai", label: "OpenAI", desc: "Function-calling integration for GPT" },
  { id: "gemini", label: "Gemini", desc: "Tool-use integration for Gemini" },
  { id: "cursor", label: "Cursor", desc: "Cursor IDE MCP server" },
];
