#!/usr/bin/env node
/**
 * Vendor the GroundX agent skills into the middleware — DUAL MODE.
 *
 * Source: https://github.com/GroundX-Studio/groundx-agent-harness (public, MIT).
 * Copies `skills/**` markdown into `middleware/assets/groundx-skills/` plus a
 * MANIFEST.json recording the exact commit. The optional chat capability reads
 * that pack (middleware/src/services/groundxSkills.ts) and NEVER fetches GitHub
 * at runtime — runtime always reads the committed pack.
 *
 * Currency vs air-gap (both must work):
 *  - ONLINE: refresh from upstream `main` HEAD so the pack stays current.
 *  - AIR-GAPPED / offline: pass `--offline` (or GROUNDX_SKILLS_OFFLINE=1), or
 *    just let the network call fail — the sync is BEST-EFFORT and falls back to
 *    the committed pack instead of breaking the build.
 *
 * SAFE REFRESH (atomic): the new pack is built in a staging dir ADJACENT to the
 * destination, then swapped in with a rename only once it is fully downloaded;
 * the old pack is removed last. A failed/interrupted refresh therefore never
 * destroys the committed pack — the live pack is untouched until the swap.
 *
 * The only hard error is "offline AND no committed pack" — nothing to fall back
 * to. Re-run to refresh:  node scripts/sync-groundx-skills.mjs [ref]
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "GroundX-Studio/groundx-agent-harness";
const SCAFFOLD_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DEFAULT_DEST = join(SCAFFOLD_ROOT, "middleware", "assets", "groundx-skills");

// Upstream docs sometimes carry placeholder PEM/cert blocks in config examples.
// They are not real secrets, but we must not vendor key-shaped blobs into the
// repo (the pre-commit secret scanner rejects them, and it's bad hygiene). Strip
// the block but keep its surrounding field name/context.
// Built from a fragment so this source file itself contains no literal PEM
// header (which would otherwise trip the same secret scanner it protects).
const DASH = "-----";
const SECRET_BLOCK_RE = new RegExp(
  `${DASH}BEGIN [^\\n-]*(?:PRIVATE KEY|CERTIFICATE)[^\\n-]*${DASH}[\\s\\S]*?${DASH}END [^\\n-]*(?:PRIVATE KEY|CERTIFICATE)[^\\n-]*${DASH}`,
  "g",
);

/** Redact example PEM/certificate blocks from vendored markdown. */
export function redactSecretBlocks(text) {
  return text.replace(SECRET_BLOCK_RE, "<redacted: example key/certificate block stripped during vendoring>");
}

function sanitizePack(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) sanitizePack(p);
    else if (entry.name.endsWith(".md")) {
      const orig = readFileSync(p, "utf8");
      const red = redactSecretBlocks(orig);
      if (red !== orig) writeFileSync(p, red);
    }
  }
}

/**
 * @param {object} [opts]
 * @param {string} [opts.ref]      upstream ref to track (default "main" HEAD)
 * @param {string} [opts.repo]
 * @param {string} [opts.destDir]
 * @param {boolean} [opts.offline] skip the network entirely and use the committed pack
 * @param {Function} [opts.exec]   injectable command runner (tests pass a stub)
 * @param {object} [opts.log]
 * @returns {{status: "updated"|"offline-vendored"|"vendored-fallback", commit?: string, fileCount?: number, error?: string, destDir: string}}
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
  const parent = dirname(destDir);

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

  const work = mkdtempSync(join(tmpdir(), "gx-skills-work-"));
  let staging = null;
  try {
    // Resolve upstream HEAD for `ref` (records the exact commit for provenance).
    const lsRemote = exec(`git ls-remote https://github.com/${repo}.git ${ref}`, { encoding: "utf8" });
    const commit = String(lsRemote).trim().split(/\s+/)[0];
    if (!commit) throw new Error(`could not resolve ref "${ref}" on ${repo}`);

    // -f so an HTTP error (404/rate-limit) fails loudly and hits the fallback.
    exec(`curl -fsSL https://codeload.github.com/${repo}/tar.gz/${commit} -o "${join(work, "repo.tgz")}"`, { stdio: "inherit" });
    exec(`tar xzf "${join(work, "repo.tgz")}" -C "${work}"`);
    const extracted = readdirSync(work).find((d) => d.startsWith("groundx-agent-harness"));
    if (!extracted) throw new Error("tarball layout unexpected — no groundx-agent-harness dir");
    const skillsSrc = join(work, extracted, "skills");
    statSync(skillsSrc); // throws if missing

    // Build the new pack in a staging dir ADJACENT to destDir (same filesystem,
    // so the final rename is atomic). The live pack is NOT touched yet.
    mkdirSync(parent, { recursive: true });
    staging = mkdtempSync(join(parent, ".gxskills-stage-"));
    // Markdown only; ROUTING.md / CHANGELOG.md are agent-harness plumbing, not
    // product knowledge (the loader also skips them defensively).
    cpSync(skillsSrc, staging, {
      recursive: true,
      filter: (src) => statSync(src).isDirectory() || (src.endsWith(".md") && !/(?:^|\/)(?:ROUTING|CHANGELOG)\.md$/.test(src)),
    });
    // Strip any placeholder key/cert blocks before the pack is committed/used.
    sanitizePack(staging);

    const files = [];
    const walk = (dir, prefix = "") => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(dir, entry.name), rel);
        else files.push(rel);
      }
    };
    walk(staging);
    writeFileSync(
      join(staging, "MANIFEST.json"),
      JSON.stringify({ repo, ref, commit, syncedAt: new Date().toISOString(), fileCount: files.length, files: files.sort() }, null, 2),
    );

    // Swap the freshly-built pack into place, then remove the old one. Only here
    // is the live pack touched — and only after the new pack is fully built.
    const backup = hasVendored ? join(parent, `.gxskills-bak-${basename(staging)}`) : null;
    if (backup) renameSync(destDir, backup);
    try {
      renameSync(staging, destDir);
      staging = null;
    } catch (swapErr) {
      if (backup && !existsSync(destDir)) renameSync(backup, destDir); // restore the old pack
      throw swapErr;
    }
    if (backup) rmSync(backup, { recursive: true, force: true });

    log.log?.(`[groundx-skills] synced ${files.length} files from ${repo}@${commit.slice(0, 10)} → ${destDir}`);
    return { status: "updated", commit, fileCount: files.length, destDir };
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (hasVendored) {
      // Best-effort: a refresh failure (air-gapped runner, GitHub down, rate
      // limit) must NOT break the build — and the staged-swap above guarantees
      // the committed pack is still intact here.
      log.warn?.(`[groundx-skills] refresh failed (${msg}); keeping committed vendored pack`);
      return { status: "vendored-fallback", error: msg, destDir };
    }
    // No network AND no committed fallback — a genuine error worth surfacing.
    throw new Error(`skill sync failed and no vendored fallback present: ${msg}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
    if (staging) rmSync(staging, { recursive: true, force: true });
  }
}

// CLI entrypoint (only when run directly, not when imported by the test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // All three success states are non-fatal; only the no-fallback case throws.
  syncGroundxSkills({ ref: process.argv[2] });
}
