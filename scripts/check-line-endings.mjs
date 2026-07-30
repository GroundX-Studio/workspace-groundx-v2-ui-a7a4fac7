#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// Root-anchored (not process.cwd()) so this behaves the same whether it's
// invoked from the repo root or a subdirectory.
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

// Must match the LF text extensions declared in .gitattributes.
const lfExtensions = new Set([".ts", ".tsx", ".jsx", ".mjs", ".json", ".css", ".html", ".md", ".yaml", ".yml"]);

const violations = [];

function extensionOf(file) {
  const dot = file.lastIndexOf(".");
  return dot === -1 ? "" : file.slice(dot);
}

function scanFile(file) {
  if (!lfExtensions.has(extensionOf(file))) return;
  const path = resolve(root, file);
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  if (text.includes("\r")) violations.push(file);
}

const gitFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);

for (const file of gitFiles) {
  scanFile(file);
}

if (violations.length) {
  console.error("Line-ending check failed — CRLF or mixed line endings found:");
  for (const file of violations) console.error(`- ${file}`);
  process.exit(1);
}

console.log("Line-ending check passed.");
