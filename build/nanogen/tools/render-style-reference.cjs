#!/usr/bin/env node
// render-style-reference.cjs
//
// Reads styles.json (72 presets × 10 categories) and emits a markdown
// block suitable for pasting into reference.md's "Complete style catalog"
// section. Groups presets by category in the canonical ordering defined
// here (same as FIXED_STYLE_CATEGORIES in generate.cjs), and emits:
//
//   ## <Category Title>
//
//   - **slug** — Name
//     > promptFragment
//
// This script is an author-time tool. It lives in build/nanogen/tools/
// and is NOT shipped into the installed skill (Phase 2 rsync excludes
// the tools/ directory).
//
// Usage:
//   node build/nanogen/tools/render-style-reference.cjs > /tmp/catalog.md

"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Canonical category ordering (matches generate.cjs FIXED_STYLE_CATEGORIES).
const CATEGORY_ORDER = [
  "pixel-art",
  "flat-vector",
  "painterly",
  "drawing-ink",
  "photographic",
  "animation-cartoon",
  "fine-art-historical",
  "game-style",
  "design-technical",
  "speculative-niche",
];

// Human-friendly titles for each category slug.
const CATEGORY_TITLES = {
  "pixel-art": "Pixel Art",
  "flat-vector": "Flat / Vector",
  "painterly": "Painterly",
  "drawing-ink": "Drawing / Ink",
  "photographic": "Photographic",
  "animation-cartoon": "Animation / Cartoon",
  "fine-art-historical": "Fine Art / Historical",
  "game-style": "Game Style",
  "design-technical": "Design / Technical",
  "speculative-niche": "Speculative / Niche",
};

function main() {
  const stylesPath = path.resolve(__dirname, "..", "styles.json");
  const raw = fs.readFileSync(stylesPath, "utf8");
  const styles = JSON.parse(raw);

  // Group by category.
  const byCategory = new Map();
  for (const s of styles) {
    if (!byCategory.has(s.category)) byCategory.set(s.category, []);
    byCategory.get(s.category).push(s);
  }

  const out = [];
  for (const cat of CATEGORY_ORDER) {
    const entries = byCategory.get(cat);
    if (!entries || entries.length === 0) continue;
    const title = CATEGORY_TITLES[cat] || cat;
    out.push(`### ${title} (\`${cat}\`)`);
    out.push("");
    for (const e of entries) {
      out.push(`- **${e.slug}** — ${e.name}`);
      out.push(`  > ${e.promptFragment}`);
    }
    out.push("");
  }

  process.stdout.write(out.join("\n"));
}

main();
