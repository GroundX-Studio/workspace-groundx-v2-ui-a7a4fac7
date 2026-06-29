#!/usr/bin/env node
/**
 * Self-test for sync-groundx-skills.mjs DUAL-MODE behavior.
 *
 * The vendored groundx-agent-harness skill pack must:
 *  - stay current when ONLINE (refresh from upstream), and
 *  - keep working when AIR-GAPPED/offline (fall back to the committed pack,
 *    never break the build).
 *
 * Run: node scripts/sync-groundx-skills.test.mjs  (non-zero exit on failure).
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { syncGroundxSkills } from "./sync-groundx-skills.mjs";

const failures = [];
const assert = (cond, msg) => { if (!cond) failures.push(msg); };

function makePack(withManifest) {
  const dir = mkdtempSync(join(tmpdir(), "gx-skills-test-"));
  if (withManifest) {
    mkdirSync(join(dir, "groundx-api"), { recursive: true });
    writeFileSync(join(dir, "groundx-api", "SKILL.md"), "# sentinel\n");
    writeFileSync(join(dir, "MANIFEST.json"), JSON.stringify({ commit: "SENTINEL" }));
  }
  return dir;
}
const quiet = { log() {}, warn() {} };
const manifestCommit = (dir) => JSON.parse(readFileSync(join(dir, "MANIFEST.json"), "utf8")).commit;

// 1) OFFLINE + committed pack present → use the vendored pack, no network, pack untouched.
{
  const dir = makePack(true);
  const r = syncGroundxSkills({ offline: true, destDir: dir, log: quiet });
  assert(r.status === "offline-vendored", `offline w/ pack: expected offline-vendored, got ${r?.status}`);
  assert(manifestCommit(dir) === "SENTINEL", "offline mode must NOT modify the committed pack");
  rmSync(dir, { recursive: true, force: true });
}

// 2) NETWORK FAILURE (air-gapped build) + committed pack present → best-effort fallback,
//    must NOT throw, must preserve the committed pack.
{
  const dir = makePack(true);
  const exploding = () => { throw new Error("simulated network failure"); };
  let threw = false, r;
  try { r = syncGroundxSkills({ destDir: dir, exec: exploding, log: quiet }); } catch { threw = true; }
  assert(!threw, "network failure WITH a committed pack must not throw (air-gap safe)");
  assert(r?.status === "vendored-fallback", `network fail w/ pack: expected vendored-fallback, got ${r?.status}`);
  assert(existsSync(join(dir, "MANIFEST.json")) && manifestCommit(dir) === "SENTINEL", "fallback must preserve the committed pack");
  rmSync(dir, { recursive: true, force: true });
}

// 3) MID-REFRESH failure (upstream commit resolves, then the download fails) +
//    committed pack present → no throw AND the committed pack is still intact.
//    Proves the staged-swap never touches the live pack until the new one is
//    fully built (no rm-before-copy window).
{
  const dir = makePack(true);
  const flakyExec = (cmd) => {
    if (/ls-remote/.test(String(cmd))) return "abc123def4567890\trefs/heads/main\n";
    throw new Error("simulated download failure (post-resolve)");
  };
  let threw = false, r;
  try { r = syncGroundxSkills({ destDir: dir, exec: flakyExec, log: quiet }); } catch { threw = true; }
  assert(!threw, "mid-refresh download failure with a committed pack must not throw");
  assert(r?.status === "vendored-fallback", `mid-refresh fail: expected vendored-fallback, got ${r?.status}`);
  assert(existsSync(join(dir, "MANIFEST.json")) && manifestCommit(dir) === "SENTINEL", "mid-refresh failure must not destroy the committed pack");
  rmSync(dir, { recursive: true, force: true });
}

// 4) OFFLINE + NO committed pack → genuine error (cannot bootstrap with no network and no fallback).
{
  const dir = makePack(false);
  let threw = false;
  try { syncGroundxSkills({ offline: true, destDir: dir, log: quiet }); } catch { threw = true; }
  assert(threw, "offline with no committed fallback must throw");
  rmSync(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error("sync-groundx-skills dual-mode tests FAILED:\n" + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("sync-groundx-skills dual-mode tests passed (4/4)");
