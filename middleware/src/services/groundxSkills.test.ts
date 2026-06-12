import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { __resetSkillSectionCache, loadSkillSections, retrieveGroundxKnowledge } from "./groundxSkills.js";

/**
 * GroundX skill-pack retrieval (2026-06-11). Mechanics pinned against a
 * controlled FIXTURE corpus (deterministic), plus one smoke test against the
 * real vendored pack (synced by scripts/sync-groundx-skills.mjs).
 */
describe("groundxSkills", () => {
  let dir: string;

  beforeEach(() => {
    __resetSkillSectionCache();
    dir = mkdtempSync(join(tmpdir(), "gx-skills-test-"));
    mkdirSync(join(dir, "alpha-skill"));
    writeFileSync(
      join(dir, "alpha-skill", "SKILL.md"),
      [
        "# Alpha skill",
        "Intro paragraph about the alpha product surface and its goals in general.",
        "## Bucket organization",
        "Buckets group documents for search. Create a bucket, upload documents, search the bucket.",
        "## Authentication",
        "Authenticate with the X-API-Key header. Keys come from the dashboard. Rotate keys regularly.",
      ].join("\n"),
    );
    mkdirSync(join(dir, "beta-skill"));
    writeFileSync(
      join(dir, "beta-skill", "SKILL.md"),
      [
        "# Beta skill",
        "## Deployment topology",
        "Helm chart installs the platform on Kubernetes. GPU nodes run the ingest models.",
      ].join("\n"),
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    __resetSkillSectionCache();
  });

  it("chunks markdown files into heading-level sections tagged by skill", () => {
    const sections = loadSkillSections(dir);
    const headings = sections.map((s) => `${s.skill}:${s.heading}`).sort();
    expect(headings).toEqual([
      "alpha-skill:Alpha skill",
      "alpha-skill:Authentication",
      "alpha-skill:Bucket organization",
      "beta-skill:Deployment topology",
    ]);
  });

  it("retrieves the matching section for a topical question", () => {
    const out = retrieveGroundxKnowledge("how do I authenticate my API keys?", { dir });
    expect(out).toContain("[alpha-skill] Authentication");
    expect(out).toContain("X-API-Key");
    expect(out).not.toContain("Helm chart");
  });

  it("returns null when nothing clears the relevance bar", () => {
    expect(retrieveGroundxKnowledge("what is the total amount due on my invoice?", { dir })).toBeNull();
  });

  it("a product-name trigger lowers the entry bar (single-term questions still retrieve)", () => {
    // "groundx" appears nowhere in the fixtures → null even WITH the trigger…
    expect(retrieveGroundxKnowledge("groundx?", { dir })).toBeNull();
    // …but a trigger term that DOES appear retrieves on that single term.
    mkdirSync(join(dir, "gamma-skill"));
    writeFileSync(
      join(dir, "gamma-skill", "SKILL.md"),
      "# Gamma\n## What GroundX is\nGroundX is the document understanding platform from EyeLevel.",
    );
    __resetSkillSectionCache();
    const out = retrieveGroundxKnowledge("what do you know about groundx?", { dir });
    expect(out).toContain("[gamma-skill] What GroundX is");
  });

  it("caps the injected block at maxChars with a truncation marker", () => {
    mkdirSync(join(dir, "long-skill"));
    writeFileSync(
      join(dir, "long-skill", "SKILL.md"),
      `# Long\n## Bucket details extended\n${"buckets store documents. ".repeat(600)}`,
    );
    __resetSkillSectionCache();
    const out = retrieveGroundxKnowledge("bucket documents details", { dir, maxChars: 1000 });
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(1100);
    expect(out).toContain("…(truncated)");
  });

  it("degrades to null when the pack directory is missing (pre-sync checkout)", () => {
    expect(retrieveGroundxKnowledge("anything about buckets", { dir: join(dir, "nope") })).toBeNull();
  });

  // Smoke against the REAL vendored pack (sync script output). Asserts only
  // live-stable structure: the pack loads and a canonical product question
  // retrieves something from it.
  it("real vendored pack: loads and retrieves for a GroundX product question", () => {
    __resetSkillSectionCache();
    const sections = loadSkillSections();
    expect(sections.length).toBeGreaterThan(50);
    const out = retrieveGroundxKnowledge("what do you know about groundx?");
    expect(out).not.toBeNull();
    expect(out!).toMatch(/groundx/i);
  });
});

// chat-architecture-hardening Task 4 — planner bypass + corpus exclusions.
describe("turn-router integration", () => {
  let dir2: string;
  beforeEach(() => {
    __resetSkillSectionCache();
    dir2 = mkdtempSync(join(tmpdir(), "gx-skills-t4-"));
    mkdirSync(join(dir2, "alpha-skill"));
    writeFileSync(
      join(dir2, "alpha-skill", "SKILL.md"),
      ["# Alpha skill", "## Ingestion pipeline", "Ingestion parses documents into semantic objects."].join("\n"),
    );
    writeFileSync(
      join(dir2, "ROUTING.md"),
      "# Routing\n## Internal\nrouting table content describing which skill handles which request shapes in detail.",
    );
    mkdirSync(join(dir2, "beta-skill"));
    writeFileSync(
      join(dir2, "beta-skill", "CHANGELOG.md"),
      "# Changelog\n## v2\nrelease notes for version two with a long list of changes and fixes shipped.",
    );
  });
  afterEach(() => {
    rmSync(dir2, { recursive: true, force: true });
    __resetSkillSectionCache();
  });

  it("bypassEntryBar injects a section that scores >0 but fails the minDistinct/score bar", () => {
    // One distinct non-trigger term ("ingestion") → distinct=1 < minDistinct=2
    // → null under the internal gate; the planner's bypass still injects.
    const gated = retrieveGroundxKnowledge("ingestion?", { dir: dir2 });
    expect(gated).toBeNull();
    const bypassed = retrieveGroundxKnowledge("ingestion?", { dir: dir2, bypassEntryBar: true });
    expect(bypassed).toContain("Ingestion parses documents");
  });

  it("bypassEntryBar still returns null when NO section scores (all-stopword question)", () => {
    expect(retrieveGroundxKnowledge("what is the and of a?", { dir: dir2, bypassEntryBar: true })).toBeNull();
  });

  it("loader skips non-knowledge files (ROUTING.md, CHANGELOG.md)", () => {
    const sections = loadSkillSections(dir2);
    const skills = [...new Set(sections.map((s) => s.skill))];
    expect(sections.some((s) => s.heading === "Internal")).toBe(false);
    expect(sections.some((s) => s.heading === "v2")).toBe(false);
    expect(skills).toContain("alpha-skill");
  });
});
