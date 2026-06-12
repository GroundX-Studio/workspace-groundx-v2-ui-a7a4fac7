#!/usr/bin/env node
/**
 * Vendor the GroundX agent skills into the middleware.
 *
 * Downloads https://github.com/GroundX-Studio/groundx-agent-harness (public,
 * MIT) at a pinned ref and copies `skills/**` markdown into
 * `middleware/assets/groundx-skills/`, plus a manifest recording the exact
 * commit. The chat agent retrieves relevant sections per question
 * (middleware/src/services/groundxSkills.ts) — vendored so production and
 * on-prem/air-gapped deploys never fetch GitHub at runtime.
 *
 * Re-run to refresh:  node scripts/sync-groundx-skills.mjs [ref]
 */
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "GroundX-Studio/groundx-agent-harness";
const ref = process.argv[2] ?? "main";

const scaffoldRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destDir = join(scaffoldRoot, "middleware", "assets", "groundx-skills");

// Resolve the exact commit for the manifest (reproducibility).
const lsRemote = execSync(`git ls-remote https://github.com/${REPO}.git ${ref}`, {
  encoding: "utf8",
});
const commit = lsRemote.trim().split(/\s+/)[0];
if (!commit) throw new Error(`could not resolve ref "${ref}" on ${REPO}`);

const work = mkdtempSync(join(tmpdir(), "gx-skills-"));
try {
  execSync(
    `curl -sL https://codeload.github.com/${REPO}/tar.gz/${commit} -o "${join(work, "repo.tgz")}"`,
    { stdio: "inherit" },
  );
  execSync(`tar xzf "${join(work, "repo.tgz")}" -C "${work}"`);
  const extracted = readdirSync(work).find((d) => d.startsWith("groundx-agent-harness"));
  if (!extracted) throw new Error("tarball layout unexpected — no groundx-agent-harness dir");
  const skillsSrc = join(work, extracted, "skills");
  statSync(skillsSrc); // throws if missing

  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  // Markdown only — scripts/plugins in the repo are for IDE agents, not us.
  cpSync(skillsSrc, destDir, {
    recursive: true,
    // ROUTING.md / CHANGELOG.md are agent-harness plumbing, not product
    // knowledge — excluded from the vendored corpus (the loader also skips
    // them defensively; chat-architecture-hardening Task 4).
    filter: (src) =>
      statSync(src).isDirectory() ||
      (src.endsWith(".md") && !/(?:^|\/)(?:ROUTING|CHANGELOG)\.md$/.test(src)),
  });

  const files = [];
  const walk = (dir, prefix = "") => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(join(dir, entry.name), rel);
      else files.push(rel);
    }
  };
  walk(destDir);

  writeFileSync(
    join(destDir, "MANIFEST.json"),
    JSON.stringify({ repo: REPO, ref, commit, syncedAt: new Date().toISOString(), fileCount: files.length, files: files.sort() }, null, 2),
  );
  console.log(`synced ${files.length} skill files from ${REPO}@${commit.slice(0, 10)} → ${destDir}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
