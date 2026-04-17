#!/usr/bin/env node
// test_docs_lint.cjs
//
// Doc-lint tests for SKILL.md and reference.md.
//
// Enforces:
//   (1) No trademarked-artist / studio tokens appear in PROSE
//       (SKILL.md is all prose; reference.md's catalog section is
//       exempt because the slug + name fields are identifiers, not
//       claims of likeness).
//   (2) SKILL.md's top rule mentions GEMINI_API_KEY early so the
//       agent sees the env-check requirement up front.
//   (3) reference.md's catalog lists all 72 slugs from styles.json.
//
// Approach for (1):
//   - SKILL.md: lint the entire file (no catalog section in it).
//   - reference.md: redact lines that are catalog bullet items
//     (lines starting with "- **" plus their continuation
//     blockquote "  > ..." lines). This lets prose elsewhere in
//     the file be checked while exempting the data block.
//
// Zero deps — Node built-ins only.

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

const FORBIDDEN_TOKENS = [
  "studio ghibli",
  "ghibli",
  "pixar",
  "dreamworks",
  "disney",
  "mike mignola",
  "mignola",
  "bruce timm",
  "moebius",
  "akira kurosawa",
  "rembrandt",
  "picasso",
  "van gogh",
];

let passed = 0;
let failed = 0;

function ok(name) {
  passed += 1;
  console.log(`  ok  ${name}`);
}
function notOk(name, msg) {
  failed += 1;
  console.log(`  FAIL ${name}`);
  if (msg) console.log(`       ${msg}`);
}

// Strip catalog bullet lines from reference.md prose before linting.
// A catalog bullet is a line that starts with "- **" (slug bullet).
// The following blockquote line (starts with "  > ") is the
// promptFragment and should also be exempt because promptFragments
// may contain artist-adjacent words that were approved in the
// catalog vetting process.
function redactCatalogBullets(text) {
  const lines = text.split("\n");
  const out = [];
  for (const line of lines) {
    if (/^- \*\*/.test(line)) {
      // Slug bullet — redact with placeholder so line-numbering
      // in error messages is preserved.
      out.push("");
    } else if (/^\s{2}>\s/.test(line)) {
      // Blockquote continuation of a catalog bullet — redact.
      out.push("");
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function scanForForbidden(text, label) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const tok of FORBIDDEN_TOKENS) {
    const idx = lower.indexOf(tok);
    if (idx !== -1) {
      // Find the line number of the first match.
      const before = lower.slice(0, idx);
      const lineNum = before.split("\n").length;
      hits.push({ token: tok, line: lineNum });
    }
  }
  return hits;
}

// Test 1 — SKILL.md has no forbidden tokens.
(function testSkillMdForbidden() {
  const p = path.join(ROOT, "SKILL.md");
  const text = fs.readFileSync(p, "utf8");
  const hits = scanForForbidden(text, "SKILL.md");
  if (hits.length === 0) {
    ok("SKILL.md: no forbidden tokens in prose");
  } else {
    notOk(
      "SKILL.md: no forbidden tokens in prose",
      "hits: " + JSON.stringify(hits)
    );
  }
})();

// Test 2 — reference.md has no forbidden tokens OUTSIDE the catalog.
(function testReferenceMdForbidden() {
  const p = path.join(ROOT, "reference.md");
  const text = fs.readFileSync(p, "utf8");
  const redacted = redactCatalogBullets(text);
  const hits = scanForForbidden(redacted, "reference.md (prose only)");
  if (hits.length === 0) {
    ok("reference.md: no forbidden tokens in prose (catalog exempt)");
  } else {
    notOk(
      "reference.md: no forbidden tokens in prose (catalog exempt)",
      "hits: " + JSON.stringify(hits)
    );
  }
})();

// Test 3 (bonus) — SKILL.md's top rule mentions GEMINI_API_KEY and
// "set" within the first 20 lines of the body (after frontmatter).
(function testSkillMdTopRule() {
  const p = path.join(ROOT, "SKILL.md");
  const text = fs.readFileSync(p, "utf8");
  const lines = text.split("\n");
  // Skip frontmatter: find second "---" to determine body start.
  let bodyStart = 0;
  if (lines[0] === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "---") {
        bodyStart = i + 1;
        break;
      }
    }
  }
  const first20 = lines.slice(bodyStart, bodyStart + 20).join("\n");
  const hasKey = first20.includes("GEMINI_API_KEY");
  const hasSet = /\bset\b/i.test(first20);
  if (hasKey && hasSet) {
    ok("SKILL.md: top rule mentions GEMINI_API_KEY + 'set' in first 20 body lines");
  } else {
    notOk(
      "SKILL.md: top rule mentions GEMINI_API_KEY + 'set' in first 20 body lines",
      `hasKey=${hasKey} hasSet=${hasSet}`
    );
  }
})();

// Test 4 (bonus) — reference.md catalog lists all 72 slugs from styles.json.
(function testReferenceMdCatalogHasAll72() {
  const stylesPath = path.join(ROOT, "styles.json");
  const styles = JSON.parse(fs.readFileSync(stylesPath, "utf8"));
  const refPath = path.join(ROOT, "reference.md");
  const refText = fs.readFileSync(refPath, "utf8");
  const missing = [];
  for (const s of styles) {
    // Each slug should appear as "**<slug>**" in a catalog bullet.
    const needle = `**${s.slug}**`;
    if (!refText.includes(needle)) missing.push(s.slug);
  }
  if (styles.length === 72 && missing.length === 0) {
    ok(`reference.md: catalog includes all ${styles.length} slugs`);
  } else {
    notOk(
      `reference.md: catalog includes all ${styles.length} slugs`,
      `styles.length=${styles.length} missing=${JSON.stringify(missing)}`
    );
  }
})();

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
