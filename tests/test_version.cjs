"use strict";
// Release version consistency: CLI constant, package.json, plugin manifest,
// marketplace, and the first CHANGELOG heading must agree.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const CLI = path.join(ROOT, "build", "nanogen", "generate.cjs");
const INSTALLED_CLI = path.join(ROOT, "skills", "nanogen", "generate.cjs");
const { NANOGEN_VERSION } = require(CLI);

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test("version is date-based CalVer", () => {
  assert.match(NANOGEN_VERSION, /^\d{4}\.\d{1,2}\.\d{1,2}$/);
});

test("CLI version matches package.json, plugin.json and the first CHANGELOG heading", () => {
  assert.equal(readJson("package.json").version, NANOGEN_VERSION);
  assert.equal(readJson("skills/.claude-plugin/plugin.json").version, NANOGEN_VERSION);
  const changelog = fs.readFileSync(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const first = changelog.match(/^## v(\S+)/m);
  assert.ok(first, 'CHANGELOG.md has a "## v" heading');
  assert.equal(first[1], NANOGEN_VERSION);
});

test("marketplace and plugin manifests point at the skill", () => {
  const plugin = readJson("skills/.claude-plugin/plugin.json");
  const market = readJson(".claude-plugin/marketplace.json");
  assert.equal(plugin.name, "nanogen");
  assert.equal(market.name, "nanogen");
  assert.deepEqual(market.plugins.map((p) => [p.name, p.source]), [["nanogen", "./skills"]]);
  assert.ok(fs.existsSync(path.join(ROOT, "skills/nanogen/SKILL.md")));
  assert.equal(plugin.skills, "./nanogen");
  // The plugin root is skills/, so only the skill ships, and the repo's
  // CLAUDE.md stays out of it (claude plugin validate --strict warns on it).
  assert.ok(!fs.existsSync(path.join(ROOT, "skills/CLAUDE.md")));
  assert.ok(!fs.existsSync(path.join(ROOT, ".claude-plugin/plugin.json")));
  // Installs copy only skills/, so the license has to live there too.
  assert.equal(fs.readFileSync(path.join(ROOT, "skills/LICENSE"), "utf8"), fs.readFileSync(path.join(ROOT, "LICENSE"), "utf8"));
  assert.ok(!fs.existsSync(path.join(ROOT, ".claude/skills/nanogen")), "skill moved to skills/nanogen");
  const skill = fs.readFileSync(path.join(ROOT, "skills/nanogen/SKILL.md"), "utf8");
  assert.ok(skill.includes("Bash(node ${CLAUDE_SKILL_DIR}/generate.cjs *)"));
  assert.ok(!skill.includes(".claude/skills/nanogen"));
});

test("--version prints just the version; --help shows it", () => {
  for (const cli of [CLI, INSTALLED_CLI]) {
    const v = spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8" });
    assert.equal(v.status, 0);
    assert.equal(v.stdout, `${NANOGEN_VERSION}\n`);
    const h = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
    assert.equal(h.status, 0);
    assert.ok(h.stdout.includes(`nanogen v${NANOGEN_VERSION}`));
  }
});

test("JSON results and errors carry nanogenVersion", () => {
  const env = { PATH: process.env.PATH || "/usr/bin:/bin", NANOGEN_DOTENV_PATH: "/nonexistent" };
  const dry = spawnSync(process.execPath,
    [CLI, "--prompt", "x", "--output", "/tmp/nanogen-version-test.png", "--dry-run"],
    { encoding: "utf8", env });
  assert.equal(JSON.parse(dry.stdout).nanogenVersion, NANOGEN_VERSION);
  const err = spawnSync(process.execPath, [CLI], { encoding: "utf8", env });
  const j = JSON.parse(err.stdout);
  assert.equal(j.success, false);
  assert.equal(j.nanogenVersion, NANOGEN_VERSION);
});

let passed = 0, failed = 0;
for (const { name, fn } of tests) {
  try { fn(); passed++; console.log(`ok  ${name}`); }
  catch (e) { failed++; console.log(`FAIL ${name}`); console.log("    " + (e && e.message || e)); }
}
console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""}`);
if (failed) process.exit(1);
