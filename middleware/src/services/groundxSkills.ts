/**
 * GroundX skill-pack retrieval (2026-06-11).
 *
 * The chat agent's GroundX product knowledge comes from the REAL agent
 * skills — the vendored markdown of
 * https://github.com/GroundX-Studio/groundx-agent-harness (public, MIT),
 * synced into `middleware/assets/groundx-skills/` by
 * `scripts/sync-groundx-skills.mjs` at a pinned commit (see MANIFEST.json).
 * No runtime GitHub fetch — on-prem/air-gapped deploys carry the pack.
 *
 * The full pack is ~1.4MB across 7 skills, far too large for a prompt, so
 * retrieval is SECTION-level: every markdown file is chunked by `##`
 * headings, sections are keyword-scored against the user's question, and
 * only the top few sections (capped) are injected into the grounded system
 * prompt for that turn. The replaced predecessor was a hard-coded "ABOUT
 * GROUNDX" capsule in ragPipeline.ts — one source of truth now.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillSection {
  /** Top-level skill directory, e.g. "groundx-architecture". */
  skill: string;
  /** File path relative to the skills root. */
  file: string;
  /** The `##` heading (or the file's `#` title for the preamble). */
  heading: string;
  text: string;
}

/**
 * Default vendored location. Resolves relative to THIS module so it works
 * from both `src/` (tsx dev) and `dist/` (built) — both sit one level under
 * the middleware package root, and `assets/` sits at the root.
 */
const DEFAULT_SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "groundx-skills");

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "is",
  "are", "was", "be", "it", "its", "this", "that", "what", "whats", "how",
  "do", "does", "did", "can", "i", "you", "we", "my", "your", "about", "me",
  "tell", "know", "there", "here", "when", "where", "who", "why", "which",
  "have", "has", "into", "from", "at", "by", "as", "all", "any", "they",
]);

/** Product-name terms that make a question unambiguously "about GroundX". */
const STRONG_TRIGGERS = new Set(["groundx", "eyelevel", "xray", "x-ray"]);

const tokenize = (text: string): string[] =>
  (text.toLowerCase().match(/[a-z0-9][a-z0-9_-]+/g) ?? []).filter((t) => t.length > 2 && !STOPWORDS.has(t));

// ── corpus loading (lazy, cached per dir) ────────────────────────────
const sectionCache = new Map<string, SkillSection[]>();

function walkMarkdown(dir: string, prefix = ""): Array<{ rel: string; abs: string }> {
  const out: Array<{ rel: string; abs: string }> = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walkMarkdown(join(dir, entry.name), rel));
    // Non-knowledge files (chat-architecture-hardening Task 4): routing
    // tables + release notes are agent-harness plumbing, not product
    // knowledge — the sync script excludes them and the loader skips them
    // defensively (older vendored packs may still carry them).
    else if (entry.name.endsWith(".md") && !EXCLUDED_FILES.has(entry.name)) out.push({ rel, abs: join(dir, entry.name) });
  }
  return out;
}

const EXCLUDED_FILES = new Set(["ROUTING.md", "CHANGELOG.md"]);

export function loadSkillSections(dir: string = DEFAULT_SKILLS_DIR): SkillSection[] {
  const cached = sectionCache.get(dir);
  if (cached) return cached;
  const sections: SkillSection[] = [];
  let files: Array<{ rel: string; abs: string }> = [];
  try {
    files = walkMarkdown(dir);
  } catch {
    // Pack not vendored (fresh checkout before sync) — degrade to empty;
    // retrieval returns null and the prompt stays snippets-only.
    sectionCache.set(dir, sections);
    return sections;
  }
  for (const { rel, abs } of files) {
    const skill = rel.includes("/") ? rel.split("/")[0] : "(root)";
    let raw = "";
    try {
      raw = readFileSync(abs, "utf8");
    } catch {
      continue;
    }
    // Split on `##` headings; the chunk before the first `##` keeps the
    // file's `#` title as its heading.
    const parts = raw.split(/^(?=## )/m);
    for (const part of parts) {
      const headingMatch = part.match(/^#{1,2} (.+)$/m);
      const heading = headingMatch?.[1]?.trim() ?? rel;
      const text = part.trim();
      if (text.length < 40) continue; // skip stub chunks
      sections.push({ skill, file: rel, heading, text });
    }
  }
  sectionCache.set(dir, sections);
  return sections;
}

/** Test hook — drop the cache so fixture dirs reload. */
export function __resetSkillSectionCache(): void {
  sectionCache.clear();
}

// ── retrieval ────────────────────────────────────────────────────────
export interface RetrieveOptions {
  dir?: string;
  /** Total injected-character budget. */
  maxChars?: number;
  maxSections?: number;
  /**
   * Turn-router bypass (chat-architecture-hardening Task 4): when the
   * planner has ALREADY decided this is a product-knowledge turn, the
   * minDistinct/score entry bar (the false-positive heuristic the planner
   * replaces) is skipped — section RANKING and CAPS still apply, and the
   * retriever still returns null when no section scores at all.
   */
  bypassEntryBar?: boolean;
}

/**
 * Retrieve the skill sections most relevant to `question`, formatted for the
 * grounded system prompt. Returns `null` when nothing clears the relevance
 * bar — the prompt then stays snippets-only (zero overhead for ordinary
 * document questions).
 *
 * Scoring: keyword overlap (heading hits ×3), with a lower entry bar when
 * the question names the product (groundx/eyelevel/x-ray) — those are
 * unambiguously product questions even with a single content term.
 */
export function retrieveGroundxKnowledge(question: string, options: RetrieveOptions = {}): string | null {
  const { dir = DEFAULT_SKILLS_DIR, maxChars = 4_500, maxSections = 3, bypassEntryBar = false } = options;
  const terms = [...new Set(tokenize(question))];
  if (terms.length === 0) return null;
  const hasStrongTrigger = terms.some((t) => STRONG_TRIGGERS.has(t));
  const minDistinct = hasStrongTrigger ? 1 : 2;

  const sections = loadSkillSections(dir);
  if (sections.length === 0) return null;

  const scored = sections
    .map((s) => {
      const headingLower = s.heading.toLowerCase();
      const textLower = s.text.toLowerCase();
      let distinct = 0;
      let score = 0;
      for (const term of terms) {
        const inHeading = headingLower.includes(term);
        const occurrences = textLower.split(term).length - 1;
        if (occurrences > 0 || inHeading) distinct += 1;
        score += Math.min(occurrences, 3) + (inHeading ? 3 : 0) + (STRONG_TRIGGERS.has(term) && occurrences > 0 ? 1 : 0);
      }
      return { s, distinct, score };
    })
    .filter((r) => (bypassEntryBar ? r.score > 0 : r.distinct >= minDistinct && r.score >= 2))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSections);

  if (scored.length === 0) return null;

  const blocks: string[] = [];
  let used = 0;
  for (const { s } of scored) {
    const header = `### [${s.skill}] ${s.heading}\n`;
    const room = maxChars - used - header.length;
    if (room <= 200) break;
    const body = s.text.length > room ? `${s.text.slice(0, room)}…(truncated)` : s.text;
    blocks.push(header + body);
    used += header.length + body.length;
  }
  return blocks.length > 0 ? blocks.join("\n\n") : null;
}
