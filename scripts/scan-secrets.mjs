#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = process.cwd();
const ignoredFiles = new Set(["package-lock.json"]);
const violations = [];

const secretPatterns = [
  { name: "OpenAI-style API key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}\b/g },
  { name: "GitHub token", regex: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{24,}\b/g },
  { name: "GitHub fine-grained token", regex: /\bgithub_pat_[A-Za-z0-9_]{40,}\b/g },
  { name: "PEM private key", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

function scanFile(file) {
  if (ignoredFiles.has(file) || file.endsWith(".png") || file.endsWith(".jpg") || file.endsWith(".jpeg")) return;
  const text = readFileSync(file, "utf8");
  for (const pattern of secretPatterns) {
    if (pattern.regex.test(text)) violations.push(`${file}: contains ${pattern.name}`);
    pattern.regex.lastIndex = 0;
  }
}

const gitFiles = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
  cwd: root,
  encoding: "utf8",
}).split("\0").filter(Boolean);

for (const file of gitFiles) {
  scanFile(file);
}

if (violations.length) {
  console.error("Secret scan failed:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Secret scan passed.");
