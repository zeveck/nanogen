"use strict";
// Phase 5 — history JSONL: appendHistory, readHistory, ID derivation,
// --no-history, --history-parent unknown warning, refusal→history row,
// tolerant reader, append-only contract, history-write failure.
//
// Mix of direct-function tests (against the exported API) and
// subprocess tests (against the CLI with an in-process mock server).
// The subprocess pattern uses async spawn (NOT spawnSync) — spawnSync
// blocks the parent event loop which deadlocks the mock server.

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "generate.cjs");
const GEN = require("../generate.cjs");

// ---------------------------------------------------------------------------
// withCleanEnv + subprocess env helpers
// ---------------------------------------------------------------------------

const NUKE_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "NANOGEN_API_BASE",
  "NANOGEN_RETRY_BASE_MS",
  "NANOGEN_FETCH_TIMEOUT_MS",
  "NANOGEN_MAX_RETRIES",
];

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

// ---------------------------------------------------------------------------
// Mock server (mirrors test_http_retry.cjs pattern)
// ---------------------------------------------------------------------------

const TINY_PNG_B64 = fs.readFileSync(
  path.resolve(__dirname, "fixtures", "tiny-1x1.png")
).toString("base64");

function successBody(extraCandidateFields = {}) {
  return {
    candidates: [Object.assign({
      finishReason: "STOP",
      content: {
        parts: [
          { inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } },
        ],
      },
    }, extraCandidateFields)],
  };
}

function refusalBody(reason) {
  return {
    candidates: [{
      finishReason: reason,
      content: { parts: [{ text: "I cannot help with that." }] },
    }],
  };
}

function makeMock(script) {
  const state = { attempts: 0, server: null, port: 0 };
  const server = http.createServer((req, res) => {
    state.attempts++;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const idx = Math.min(state.attempts - 1, script.length - 1);
      try { script[idx](req, res, state); }
      catch (e) {
        try { res.statusCode = 500; res.end("handler threw: " + e.message); } catch (_) {}
      }
    });
    req.on("error", () => {});
    res.on("error", () => {});
  });
  state.server = server;
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      state.port = server.address().port;
      resolve(state);
    });
  });
}

function closeMock(mock) {
  return new Promise((resolve) => {
    if (!mock || !mock.server) return resolve();
    mock.server.closeAllConnections && mock.server.closeAllConnections();
    mock.server.close(() => resolve());
  });
}

function respondJson(res, status, bodyObj, headers = {}) {
  const body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

// ---------------------------------------------------------------------------
// CLI runner (async spawn — see note at top of file).
// ---------------------------------------------------------------------------

function runCLI(args, envExtra = {}, cwd) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: cleanSubprocessEnv({
        GEMINI_API_KEY: "test-key",
        NANOGEN_RETRY_BASE_MS: "5",
        ...envExtra,
      }),
      cwd: cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (d) => { stdout += d.toString("utf8"); });
    child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });
    child.on("close", (code, signal) => {
      resolve({ status: code, signal, stdout, stderr });
    });
  });
}

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-hist-"));
}

function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function parseLastJsonLine(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

function readHistoryFile(cwd) {
  const p = path.join(cwd, ".nanogen-history.jsonl");
  if (!fs.existsSync(p)) return [];
  const txt = fs.readFileSync(p, "utf8");
  return txt.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

async function runAll() {
  let passed = 0, failed = 0;
  const start = Date.now();
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
  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\n${passed}/${tests.length} passed${failed ? `, ${failed} failed` : ""} (${elapsed}s)`);
  if (failed) process.exit(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// 1. Direct: appendHistory + readHistory round-trip. Write two entries,
// read them back in order.
test("appendHistory + readHistory round-trip preserves order", () => {
  const tmp = mkTmp();
  try {
    const e1 = { id: "a-1", timestamp: "2026-04-17T00:00:00.000Z", prompt: "first" };
    const e2 = { id: "b-2", timestamp: "2026-04-17T00:00:01.000Z", prompt: "second" };
    assert.deepEqual(GEN.appendHistory(e1, tmp), { ok: true });
    assert.deepEqual(GEN.appendHistory(e2, tmp), { ok: true });
    const got = GEN.readHistory(tmp);
    assert.equal(got.length, 2);
    assert.equal(got[0].id, "a-1");
    assert.equal(got[1].id, "b-2");
    assert.equal(got[0].prompt, "first");
    assert.equal(got[1].prompt, "second");
  } finally {
    rmTmp(tmp);
  }
});

// 2. ID derivation: sha-8 suffix, same path → same id, same slug +
// different path → different ids.
test("deriveHistoryId: sha-8 suffix; path stability; collision resistance", () => {
  // Same path → same id.
  const args1 = { output: "/tmp/some/dir/foo.png" };
  const args2 = { output: "/tmp/some/dir/foo.png" };
  const id1 = GEN.deriveHistoryId(args1);
  const id2 = GEN.deriveHistoryId(args2);
  assert.equal(id1, id2);
  assert.match(id1, /^[a-z0-9-]+-[a-f0-9]{8}$/,
    `id ${id1} does not match slug-sha8 pattern`);

  // Different paths that would slugify the same → different sha-8s.
  const idA = GEN.deriveHistoryId({ output: "/tmp/a/foo.png" });
  const idB = GEN.deriveHistoryId({ output: "/tmp/b/foo.png" });
  assert.notEqual(idA, idB,
    "paths with same basename should produce different ids via sha-8 suffix");
  // But slug prefix should be the same.
  const pfxA = idA.slice(0, idA.lastIndexOf("-"));
  const pfxB = idB.slice(0, idB.lastIndexOf("-"));
  assert.equal(pfxA, pfxB);
  assert.equal(pfxA, "foo");

  // --history-id verbatim wins.
  const verbatim = GEN.deriveHistoryId({
    output: "/tmp/foo.png", historyId: "my-custom-id",
  });
  assert.equal(verbatim, "my-custom-id");
});

// 3. End-to-end: --no-history skips append.
test("--no-history skips history append (no file created)", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "out.png");
    const r = await runCLI(
      ["--prompt", "hello", "--output", outPath, "--no-history"],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0,
      `expected exit 0; stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.ok(fs.existsSync(outPath), "output file should exist");
    assert.ok(!fs.existsSync(path.join(tmp, ".nanogen-history.jsonl")),
      ".nanogen-history.jsonl should NOT exist with --no-history");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 4. End-to-end: --history-parent recorded as parentId.
test("--history-parent recorded as parentId in history entry", async () => {
  const mock = await makeMock([
    // Two successful responses for two invocations.
    (req, res) => respondJson(res, 200, successBody()),
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    // First invocation — no parent.
    const out1 = path.join(tmp, "parent.png");
    const r1 = await runCLI(
      ["--prompt", "one", "--output", out1],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r1.status, 0, `r1 stderr=${r1.stderr}; stdout=${r1.stdout}`);
    const rows1 = readHistoryFile(tmp);
    assert.equal(rows1.length, 1);
    const parentId = rows1[0].id;

    // Second invocation — uses the first's id as parent.
    const out2 = path.join(tmp, "child.png");
    const r2 = await runCLI(
      ["--prompt", "two", "--output", out2, "--history-parent", parentId],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r2.status, 0, `r2 stderr=${r2.stderr}; stdout=${r2.stdout}`);
    const rows2 = readHistoryFile(tmp);
    assert.equal(rows2.length, 2);
    assert.equal(rows2[1].parentId, parentId);
    // Unknown-parent warning should NOT fire — parent exists.
    assert.ok(!r2.stderr.includes("not found in .nanogen-history.jsonl"),
      `unexpected unknown-parent warning: ${r2.stderr}`);
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 5. Refusal case: no output file, history row with refusalReason.
test("refusal: no output file; history row has refusalReason + bytes:0", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, refusalBody("SAFETY")),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "refused.png");
    const r = await runCLI(
      ["--prompt", "something disallowed", "--output", outPath],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_REFUSED");
    assert.ok(!fs.existsSync(outPath), "output file must NOT exist on refusal");
    const rows = readHistoryFile(tmp);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].refusalReason, "finish:SAFETY");
    assert.equal(rows[0].bytes, 0);
    assert.equal(rows[0].outputFormat, null);
    assert.equal(rows[0].outputExtension, "png");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 6. Tolerant reader: malformed pre-existing history file; append still works.
test("tolerant reader skips malformed lines; new append succeeds", () => {
  const tmp = mkTmp();
  try {
    const p = path.join(tmp, ".nanogen-history.jsonl");
    // Seed with one valid line, one garbage line, one truncated line.
    const goodLine = JSON.stringify({ id: "a-1", prompt: "valid" }) + "\n";
    const garbage = "this is not JSON at all\n";
    const truncated = '{"id":"b-2","prompt":"unter';
    fs.writeFileSync(p, goodLine + garbage + truncated + "\n");
    const before = GEN.readHistory(tmp);
    assert.equal(before.length, 1, "only 1 valid entry should survive");
    assert.equal(before[0].id, "a-1");

    // New append works and is readable alongside the (skipped) garbage.
    GEN.appendHistory({ id: "c-3", prompt: "after garbage" }, tmp);
    const after = GEN.readHistory(tmp);
    assert.equal(after.length, 2);
    assert.equal(after[1].id, "c-3");
  } finally {
    rmTmp(tmp);
  }
});

// 7. Append-only contract: 2 invocations → wc -l == 2, first line byte-identical.
test("append-only: two invocations → 2 lines, first line unchanged", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successBody()),
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    const out1 = path.join(tmp, "a.png");
    const r1 = await runCLI(
      ["--prompt", "first", "--output", out1],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r1.status, 0, `r1 stderr=${r1.stderr}; stdout=${r1.stdout}`);
    const raw1 = fs.readFileSync(path.join(tmp, ".nanogen-history.jsonl"), "utf8");
    const firstLineAfterFirstRun = raw1.split("\n")[0];

    const out2 = path.join(tmp, "b.png");
    const r2 = await runCLI(
      ["--prompt", "second", "--output", out2],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r2.status, 0, `r2 stderr=${r2.stderr}; stdout=${r2.stdout}`);
    const raw2 = fs.readFileSync(path.join(tmp, ".nanogen-history.jsonl"), "utf8");

    // wc -l equivalent: non-empty line count.
    const lines = raw2.split("\n").filter((l) => l.length > 0);
    assert.equal(lines.length, 2, `expected 2 lines; got ${lines.length}`);
    assert.equal(lines[0], firstLineAfterFirstRun,
      "first line must be byte-identical across reads (append-only)");
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 8. Unknown --history-parent → stderr warning (pinned text); exit 0
// (generate otherwise succeeds).
test("unknown --history-parent → pinned stderr warning, exit 0", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  try {
    const outPath = path.join(tmp, "out.png");
    const r = await runCLI(
      ["--prompt", "hi", "--output", outPath, "--history-parent", "no-such-id"],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0, `stderr=${r.stderr}; stdout=${r.stdout}`);
    assert.ok(r.stderr.includes(
      'nanogen: --history-parent "no-such-id" not found in .nanogen-history.jsonl; continuing anyway.'
    ), `stderr missing pinned warning; got: ${r.stderr}`);
  } finally {
    await closeMock(mock);
    rmTmp(tmp);
  }
});

// 9. History write failure: chmod 000 tmp dir → appendHistory returns
// {warning}; CLI still emits success JSON with historyWarning field.
test("history write failure → historyWarning in stdout JSON, exit 0", async () => {
  if (process.platform === "win32") {
    console.log("    (skipped on win32 — chmod 000 not meaningful)");
    return;
  }
  if (process.getuid && process.getuid() === 0) {
    console.log("    (skipped as root — chmod 000 does not restrict root)");
    return;
  }
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successBody()),
  ]);
  const tmp = mkTmp();
  // We can't chmod the cwd 000 (the child needs to read it to resolve
  // relative paths). Instead create a nested cwd, let CLI write output
  // there, then make .nanogen-history.jsonl itself non-writable before
  // the second nested call. Simpler alternative: pre-create the history
  // file as a read-only file. We use that.
  try {
    const histPath = path.join(tmp, ".nanogen-history.jsonl");
    fs.writeFileSync(histPath, "", { mode: 0o400 });
    fs.chmodSync(histPath, 0o400);
    const outPath = path.join(tmp, "out.png");
    const r = await runCLI(
      ["--prompt", "hi", "--output", outPath],
      { NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}` },
      tmp
    );
    assert.equal(r.status, 0,
      `expected exit 0 (history failure must not fail invocation); stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.ok(typeof out.historyWarning === "string" && out.historyWarning.length > 0,
      `expected historyWarning in success JSON; got ${JSON.stringify(out)}`);
    assert.ok(fs.existsSync(outPath),
      "output file must still be written even when history fails");
  } finally {
    // Restore perms so the rmSync cleanup works.
    try { fs.chmodSync(path.join(tmp, ".nanogen-history.jsonl"), 0o600); } catch (_) {}
    await closeMock(mock);
    rmTmp(tmp);
  }
});

runAll();
