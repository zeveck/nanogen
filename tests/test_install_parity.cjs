"use strict";
// Installed-skill parity: build/nanogen/ (source of truth, where this suite
// runs) must stay byte-identical to .claude/skills/nanogen/ (the copy Claude
// Code loads on /nanogen), EXCEPT the dev-only tools/ dir which never ships.
//
// Why this test exists: the install is a hand-copied mirror with no build
// step, so it drifted ~1000 lines behind build/ once and silently shipped a
// stale skill (missing aliases, --list-models, --transparent). This test
// turns that silent drift into a failed `npm test`. Re-sync with:
//   npm run sync-skill   (or: bash scripts/sync-installed-skill.sh)

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "build", "nanogen");
const DST = path.join(ROOT, ".claude", "skills", "nanogen");

// Directory names (relative to the skill root) that are dev-only and must NOT
// be present in the installed copy.
const EXCLUDE_TOP = new Set(["tools"]);

const FIX_HINT =
  "Installed skill out of sync with build/. Re-sync: npm run sync-skill";

// Recursively list files under `dir` as paths relative to `dir`, skipping any
// top-level directory in EXCLUDE_TOP.
function listFiles(dir) {
  const out = [];
  function walk(abs, rel) {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (rel === "" && EXCLUDE_TOP.has(entry.name)) continue;
        walk(path.join(abs, entry.name), childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  }
  if (fs.existsSync(dir)) walk(dir, "");
  return out.sort();
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// 1. Same set of files on both sides (catches install-only stale files AND
//    build-only files the install is missing — e.g. the vendor/ decoder).
test("build/ and installed skill contain the same files (excluding tools/)", () => {
  const srcFiles = listFiles(SRC);
  const dstFiles = listFiles(DST);
  const onlyInBuild = srcFiles.filter(f => !dstFiles.includes(f));
  const onlyInInstall = dstFiles.filter(f => !srcFiles.includes(f));
  assert.deepEqual(
    { onlyInBuild, onlyInInstall },
    { onlyInBuild: [], onlyInInstall: [] },
    `${FIX_HINT}\n  missing from install: ${JSON.stringify(onlyInBuild)}\n  stale in install:    ${JSON.stringify(onlyInInstall)}`
  );
});

// 2. Every shared file is byte-for-byte identical.
test("every installed file is byte-identical to its build/ source", () => {
  const shared = listFiles(SRC).filter(f => fs.existsSync(path.join(DST, f)));
  const mismatched = [];
  for (const rel of shared) {
    const a = fs.readFileSync(path.join(SRC, rel));
    const b = fs.readFileSync(path.join(DST, rel));
    if (!a.equals(b)) mismatched.push(rel);
  }
  assert.deepEqual(mismatched, [], `${FIX_HINT}\n  differing files: ${JSON.stringify(mismatched)}`);
});

// 3. The dev-only tools/ dir must NOT be shipped to the install.
test("dev-only tools/ is absent from the installed skill", () => {
  assert.ok(
    !fs.existsSync(path.join(DST, "tools")),
    "tools/ is dev-only and must not exist in .claude/skills/nanogen/"
  );
});

let passed = 0, failed = 0;
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`ok  ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}`); console.log("    " + (e && e.message || e)); }
}
console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""}`);
if (failed) process.exit(1);
