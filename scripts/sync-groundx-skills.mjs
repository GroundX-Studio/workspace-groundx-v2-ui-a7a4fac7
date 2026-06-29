#!/usr/bin/env node
/**
 * Vendor the GroundX agent skills into the middleware — DUAL MODE.
 *
 * Source: https://github.com/GroundX-Studio/groundx-agent-harness (public, MIT).
 * Copies `skills/**` markdown into `middleware/assets/groundx-skills/` plus a
 * MANIFEST.json recording the exact commit. The chat agent retrieves relevant
 * sections per question (middleware/src/services/groundxSkills.ts) and NEVER
 * fetches GitHub at runtime — runtime always reads the committed pack.
 *
 * Currency vs air-gap (both must work):
 *  - ONLINE (e.g. SaaS / the current deploy): refresh from upstream `main` HEAD
 *    so the pack stays current. The scheduled workflow
 *    (.github/workflows/sync-groundx-skills.yml) runs this and PRs the refresh.
 *  - AIR-GAPPED / offline: pass `--offline` (or GROUNDX_SKILLS_OFFLINE=1), or
 *    just let the network call fail — the sync is BEST-EFFORT and falls back to
 *    the committed vendored pack instead of breaking the build.
 *
 * The only hard error is "offline AND no committed pack" — there is nothing to
 * fall back to. Re-run to refresh:  node scripts/sync-groundx-skills.mjs [ref]
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "GroundX-Studio/groundx-agent-harness";
const SCAFFOLD_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DEST = join(SCAFFOLD_ROOT, "middleware", "assets", "groundx-skills");

/**
 * @param {object} [opts]
 * @param {string} [opts.ref]      upstream ref to track (default "main" HEAD — NOT a frozen pin)
 * @param {string} [opts.repo]
 * @param {string} [opts.destDir]
 * @param {boolean} [opts.offline] skip the network entirely and use the committed pack
 * @param {Function} [opts.exec]   injectable command runner (tests pass a stub)
 * @param {object} [opts.log]
 * @returns {{status: "updated"|"offline-vendored"|"vendored-fallback", commit?: string, error?: string, destDir: string}}
 */
export function syncGroundxSkills({
  ref = "main",
  repo = REPO,
  destDir = DEFAULT_DEST,
  offline = process.env.GROUNDX_SKILLS_OFFLINE === "1",
  exec = execSync,
  log = console,
} = {}) {
  const manifestPath = join(destDir, "MANIFEST.json");
  const hasVendored = existsSync(manifestPath);

  // Air-gapped / explicitly offline: never reach out; rely on the committed pack.
  if (offline) {
    if (!hasVendored) {
      throw new Error(
        `offline mode but no vendored skill pack at ${destDir} — cannot bootstrap skills with no network and no committed fallback`,
      );
    }
    log.warn?.(`[groundx-skills] offline: using committed vendored pack (${manifestPath})`);
    return { status: "offline-vendored", destDir };
  }

  try {
    // Resolve upstream HEAD for `ref` (records the exact commit for provenance).
    const lsRemote = exec(`git ls-remote https://github.com/${repo}.git ${ref}`, { encoding: "utf8" });
    const commit = String(lsRemote).trim().split(/\s+/)[0];
    if (!commit) throw new Error(`could not resolve ref "${ref}" on ${repo}`);

    const work = mkdtempSync(join(tmpdir(), "gx-skills-"));
    try {
      // -f so an HTTP error (404/rate-limit) fails loudly and hits the fallback.
      exec(`curl -fsSL https://codeload.github.com/${repo}/tar.gz/${commit} -o "${join(work, "repo.tgz")}"`, { stdio: "inherit" });
      exec(`tar xzf "${join(work, "repo.tgz")}" -C "${work}"`);
      const extracted = readdirSync(work).find((d) => d.startsWith("groundx-agent-harness"));
      if (!extracted) throw new Error("tarball layout unexpected — no groundx-agent-harness dir");
      const skillsSrc = join(work, extracted, "skills");
      statSync(skillsSrc); // throws if missing

      rmSync(destDir, { recursive: true, force: true });
      mkdirSync(destDir, { recursive: true });
      // Markdown only; ROUTING.md / CHANGELOG.md are agent-harness plumbing, not
      // product knowledge (the loader also skips them defensively).
      cpSync(skillsSrc, destDir, {
        recursive: true,
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
        manifestPath,
        JSON.stringify(
          { repo, ref, commit, syncedAt: new Date().toISOString(), fileCount: files.length, files: files.sort() },
          null,
          2,
        ),
      );
      log.log?.(`[groundx-skills] synced ${files.length} files from ${repo}@${commit.slice(0, 10)} → ${destDir}`);
      return { status: "updated", commit, fileCount: files.length, destDir };
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (hasVendored) {
      // Best-effort: a refresh failure (air-gapped runner, GitHub down, rate
      // limit) must NOT break the build — fall back to the committed pack.
      log.warn?.(`[groundx-skills] refresh failed (${msg}); keeping committed vendored pack`);
      return { status: "vendored-fallback", error: msg, destDir };
    }
    // No network AND no committed fallback — a genuine error worth surfacing.
    throw new Error(`skill sync failed and no vendored fallback present: ${msg}`);
  }
}

// CLI entrypoint (only when run directly, not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // All three success states are non-fatal; only the no-fallback case throws.
  syncGroundxSkills({ ref: process.argv[2] });
}
