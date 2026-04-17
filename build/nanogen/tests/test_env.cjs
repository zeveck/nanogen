"use strict";
// Phase 4: resolveApiKey() + .env walker tests.
//
// Critical reproducer: `GEMINI_API_KEY=""` (empty) must fall through to the
// .env lookup — process.loadEnvFile would NOT overwrite the already-set
// empty value, so our hand-rolled parser + explicit empty-as-unset logic
// sidesteps that pitfall. See plan Phase 4 rationale.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "generate.cjs");
const GEN = require("../generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv + helpers
// ---------------------------------------------------------------------------

const NUKE_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "NANOGEN_API_BASE",
  "NANOGEN_RETRY_BASE_MS",
  "NANOGEN_FETCH_TIMEOUT_MS",
  "NANOGEN_MAX_RETRIES",
];

function withCleanEnv(fn) {
  const snapshot = {};
  for (const k of NUKE_KEYS) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of NUKE_KEYS) {
      if (snapshot[k] === undefined) delete process.env[k];
      else process.env[k] = snapshot[k];
    }
  }
}

function cleanSubprocessEnv(extra = {}) {
  const env = { PATH: process.env.PATH || "/usr/bin:/bin" };
  if (process.env.HOME) env.HOME = process.env.HOME;
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  for (const k of NUKE_KEYS) delete env[k];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  return env;
}

function mkTmp(prefix = "nanogen-env-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function captureStderr(fn) {
  const originalWrite = process.stderr.write.bind(process.stderr);
  const chunks = [];
  process.stderr.write = (chunk) => {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    return true;
  };
  try {
    const ret = fn();
    return { ret, stderr: chunks.join("") };
  } finally {
    process.stderr.write = originalWrite;
  }
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  let passed = 0, failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`ok  ${name}`);
    } catch (e) {
      failed++;
      console.log(`FAIL ${name}`);
      console.log("    " + (e && e.stack || e));
    }
  }
  console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""}`);
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------------------
// Tests for resolveApiKey() — direct in-process calls with cwd manipulation
// ---------------------------------------------------------------------------

// 1. GEMINI_API_KEY set → returned; no stderr warning.
test("GEMINI_API_KEY set → returned, no stderr warning", () => {
  withCleanEnv(() => {
    process.env.GEMINI_API_KEY = "gem-abc";
    const { ret, stderr } = captureStderr(() => GEN.resolveApiKey());
    assert.ok(ret, "expected a resolved key");
    assert.equal(ret.key, "gem-abc");
    assert.equal(ret.source, "env:GEMINI_API_KEY");
    assert.equal(stderr, "", "no stderr warning expected");
  });
});

// 2. GOOGLE_API_KEY only → returned + stderr warning.
test("GOOGLE_API_KEY only → returned + stderr warning", () => {
  withCleanEnv(() => {
    process.env.GOOGLE_API_KEY = "goog-xyz";
    const { ret, stderr } = captureStderr(() => GEN.resolveApiKey());
    assert.ok(ret);
    assert.equal(ret.key, "goog-xyz");
    assert.equal(ret.source, "env:GOOGLE_API_KEY");
    assert.ok(
      stderr.includes("using GOOGLE_API_KEY. Prefer GEMINI_API_KEY"),
      `expected stderr warning; got: ${JSON.stringify(stderr)}`
    );
  });
});

// 3. Both set → GEMINI wins; no warning.
test("Both set → GEMINI wins, no stderr warning", () => {
  withCleanEnv(() => {
    process.env.GEMINI_API_KEY = "gem-win";
    process.env.GOOGLE_API_KEY = "goog-lose";
    const { ret, stderr } = captureStderr(() => GEN.resolveApiKey());
    assert.equal(ret.key, "gem-win");
    assert.equal(ret.source, "env:GEMINI_API_KEY");
    assert.equal(stderr, "");
  });
});

// 4. Empty GEMINI_API_KEY (both env vars also absent or empty GOOGLE) falls
//    through to .env. This is the CRITICAL reproducer (plan rationale #2).
test("empty GEMINI_API_KEY falls through to .env lookup", () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, ".env"), "GEMINI_API_KEY=from-dotenv\n");
    const r = spawnSync(
      process.execPath,
      ["-e", `
        process.env.GEMINI_API_KEY = "";
        process.env.GOOGLE_API_KEY = "";
        process.chdir(${JSON.stringify(dir)});
        const g = require(${JSON.stringify(CLI)});
        const out = g.resolveApiKey();
        process.stdout.write(JSON.stringify(out));
      `],
      { env: cleanSubprocessEnv(), encoding: "utf8" }
    );
    assert.equal(r.status, 0, `subprocess failed: ${r.stderr}`);
    const ret = JSON.parse(r.stdout);
    assert.ok(ret, "expected .env to rescue empty GEMINI_API_KEY");
    assert.equal(ret.key, "from-dotenv");
    assert.ok(ret.source.startsWith(".env:"));
    assert.ok(ret.source.endsWith(":GEMINI_API_KEY"));
  } finally {
    rmTmp(dir);
  }
});

// 5. Neither env var set; .env in cwd with GEMINI_API_KEY=foo → returns "foo".
test(".env in cwd with GEMINI_API_KEY=foo → returns foo", () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, ".env"), "GEMINI_API_KEY=foo\n");
    const r = spawnSync(
      process.execPath,
      ["-e", `
        process.chdir(${JSON.stringify(dir)});
        const g = require(${JSON.stringify(CLI)});
        const out = g.resolveApiKey();
        process.stdout.write(JSON.stringify(out));
      `],
      { env: cleanSubprocessEnv(), encoding: "utf8" }
    );
    assert.equal(r.status, 0, `subprocess failed: ${r.stderr}`);
    const ret = JSON.parse(r.stdout);
    assert.equal(ret.key, "foo");
  } finally {
    rmTmp(dir);
  }
});

// 6. .env two dirs up from cwd → walker finds it.
test(".env two dirs up → walker finds it", () => {
  const dir = mkTmp();
  try {
    const sub = path.join(dir, "a", "b");
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(dir, ".env"), "GEMINI_API_KEY=uplevel\n");
    const r = spawnSync(
      process.execPath,
      ["-e", `
        process.chdir(${JSON.stringify(sub)});
        const g = require(${JSON.stringify(CLI)});
        const out = g.resolveApiKey();
        process.stdout.write(JSON.stringify(out));
      `],
      { env: cleanSubprocessEnv(), encoding: "utf8" }
    );
    assert.equal(r.status, 0, `subprocess failed: ${r.stderr}`);
    const ret = JSON.parse(r.stdout);
    assert.ok(ret, "expected walker to find .env two dirs up");
    assert.equal(ret.key, "uplevel");
  } finally {
    rmTmp(dir);
  }
});

// 7. .env with GEMINI_API_KEY="" (empty in .env) → treated as absent.
test("GEMINI_API_KEY=\"\" in .env → treated as absent", () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, ".env"), `GEMINI_API_KEY=""\n`);
    const r = spawnSync(
      process.execPath,
      ["-e", `
        process.chdir(${JSON.stringify(dir)});
        const g = require(${JSON.stringify(CLI)});
        const out = g.resolveApiKey();
        process.stdout.write(JSON.stringify(out));
      `],
      { env: cleanSubprocessEnv(), encoding: "utf8" }
    );
    assert.equal(r.status, 0, `subprocess failed: ${r.stderr}`);
    assert.equal(r.stdout, "null",
      `expected null resolution; got ${r.stdout}`);
  } finally {
    rmTmp(dir);
  }
});

// 8. No env, no .env → null → CLI exits with E_MISSING_API_KEY.
test("no env, no .env → CLI exits with E_MISSING_API_KEY", () => {
  const dir = mkTmp();
  try {
    // no .env; build a minimal output path inside tmpdir.
    const outPath = path.join(dir, "out.png");
    const r = spawnSync(
      process.execPath,
      [CLI, "--prompt", "hello", "--output", outPath],
      { env: cleanSubprocessEnv(), cwd: dir, encoding: "utf8" }
    );
    assert.equal(r.status, 1, `expected exit 1; got ${r.status}`);
    const out = JSON.parse(r.stdout.trim().split("\n").pop());
    assert.equal(out.success, false);
    assert.equal(out.code, "E_MISSING_API_KEY");
  } finally {
    rmTmp(dir);
  }
});

// 9. .env with quoted value GEMINI_API_KEY="with spaces" → quotes stripped.
test(".env with quoted value → quotes stripped", () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, ".env"), `GEMINI_API_KEY="with spaces"\n`);
    const r = spawnSync(
      process.execPath,
      ["-e", `
        process.chdir(${JSON.stringify(dir)});
        const g = require(${JSON.stringify(CLI)});
        const out = g.resolveApiKey();
        process.stdout.write(JSON.stringify(out));
      `],
      { env: cleanSubprocessEnv(), encoding: "utf8" }
    );
    assert.equal(r.status, 0, `subprocess failed: ${r.stderr}`);
    const ret = JSON.parse(r.stdout);
    assert.equal(ret.key, "with spaces",
      `expected quotes stripped; got ${JSON.stringify(ret)}`);
  } finally {
    rmTmp(dir);
  }
});

// 10. Unreadable .env (chmod 000) → parseDotenvSync handles cleanly.
test("unreadable .env → parseDotenvSync does not crash", () => {
  const dir = mkTmp();
  try {
    const p = path.join(dir, ".env");
    fs.writeFileSync(p, "GEMINI_API_KEY=never-read\n");
    fs.chmodSync(p, 0o000);
    // Only test on POSIX as root-owned perms may not apply on Windows CI.
    if (process.platform === "win32") {
      // skip
      return;
    }
    // When invoked as root, chmod 0 still readable. Detect effective uid.
    if (typeof process.getuid === "function" && process.getuid() === 0) {
      return;
    }
    // Direct in-process: mock cwd via the findDotenvFile path walker.
    // We can just call parseDotenvSync(p) which should swallow the read
    // error and return {}.
    const parsed = GEN.parseDotenvSync(p);
    assert.deepStrictEqual(parsed, {},
      `expected empty object on unreadable; got ${JSON.stringify(parsed)}`);
  } finally {
    try { fs.chmodSync(path.join(dir, ".env"), 0o600); } catch (_) {}
    rmTmp(dir);
  }
});

// 11. parseDotenvSync handles comments and blank lines.
test("parseDotenvSync skips comments and blank lines", () => {
  const dir = mkTmp();
  try {
    const p = path.join(dir, ".env");
    fs.writeFileSync(p, [
      "# top comment",
      "",
      "GEMINI_API_KEY=real-value",
      "# trailing comment",
      "",
      "OTHER=x",
    ].join("\n"));
    const parsed = GEN.parseDotenvSync(p);
    assert.equal(parsed.GEMINI_API_KEY, "real-value");
    assert.equal(parsed.OTHER, "x");
  } finally {
    rmTmp(dir);
  }
});

// 12. Closest .env wins (cwd before parent).
test("closest .env wins over parent", () => {
  const dir = mkTmp();
  try {
    const sub = path.join(dir, "inner");
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(dir, ".env"), "GEMINI_API_KEY=parent-val\n");
    fs.writeFileSync(path.join(sub, ".env"), "GEMINI_API_KEY=child-val\n");
    const r = spawnSync(
      process.execPath,
      ["-e", `
        process.chdir(${JSON.stringify(sub)});
        const g = require(${JSON.stringify(CLI)});
        const out = g.resolveApiKey();
        process.stdout.write(JSON.stringify(out));
      `],
      { env: cleanSubprocessEnv(), encoding: "utf8" }
    );
    assert.equal(r.status, 0, `subprocess failed: ${r.stderr}`);
    const ret = JSON.parse(r.stdout);
    assert.equal(ret.key, "child-val", "closest .env should win");
  } finally {
    rmTmp(dir);
  }
});

runAll();
