"use strict";
// Phase 4: fetchWithRetry + mapHttpError + end-to-end CLI HTTP path.
// All tests run against an in-process node:http mock server on port 0.
// NANOGEN_RETRY_BASE_MS=5 keeps exponential-backoff waits in the
// single-digit-millisecond range so the whole suite runs in ~seconds.
//
// IMPORTANT — we use async spawn (NOT spawnSync). spawnSync blocks the
// parent's event loop, which means the in-process mock server cannot
// service the child's fetch. async spawn lets the server handle requests
// concurrently with the child.

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

const CLI = path.resolve(__dirname, "..", "generate.cjs");

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
// Mock server
// ---------------------------------------------------------------------------

// Load the Phase 3 tiny-1x1.png fixture to use as a successful image response.
const TINY_PNG_B64 = fs.readFileSync(
  path.resolve(__dirname, "fixtures", "tiny-1x1.png")
).toString("base64");

function successResponseBody() {
  return {
    candidates: [{
      finishReason: "STOP",
      content: {
        parts: [
          { inlineData: { mimeType: "image/png", data: TINY_PNG_B64 } },
        ],
      },
    }],
  };
}

// Create a mock server with a programmable response sequence.
// `script` is an array of handlers; each handler is called (req, res, ctx)
// in order per request. After all handlers used, subsequent requests use
// the last handler (sticky).
function makeMock(script) {
  const state = {
    attempts: 0,
    retryAfterSeenCount: 0,
    server: null,
    port: 0,
  };
  const server = http.createServer((req, res) => {
    state.attempts++;
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const idx = Math.min(state.attempts - 1, script.length - 1);
      const handler = script[idx];
      try {
        handler(req, res, state);
      } catch (e) {
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
    // Close the server; also close any lingering keep-alive sockets.
    mock.server.closeAllConnections && mock.server.closeAllConnections();
    mock.server.close(() => resolve());
  });
}

// Helper to write a JSON response.
function respondJson(res, status, bodyObj, headers = {}) {
  const body = typeof bodyObj === "string" ? bodyObj : JSON.stringify(bodyObj);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(body);
}

// ---------------------------------------------------------------------------
// CLI runner (async spawn + Promise). spawnSync blocks the event loop and
// deadlocks the in-process mock, so we must use async spawn here.
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
  return fs.mkdtempSync(path.join(os.tmpdir(), "nanogen-http-"));
}

function rmTmp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
}

function parseLastJsonLine(stdout) {
  const lines = stdout.trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
}

async function runAgainstMock(mock, envExtra = {}, argsExtra = []) {
  const tmp = mkTmp();
  const outPath = path.join(tmp, "out.png");
  const args = ["--prompt", "hello", "--output", outPath, ...argsExtra];
  try {
    const r = await runCLI(args, {
      NANOGEN_API_BASE: `http://127.0.0.1:${mock.port}`,
      ...envExtra,
    }, tmp);
    return r;
  } finally {
    rmTmp(tmp);
  }
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

// 1. Simple success: 200 with valid image bytes.
test("200 success → exit 0, success JSON, bytes > 0", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 200, successResponseBody()),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 0,
      `expected exit 0; got ${r.status}; stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.ok(out.bytes > 0, `expected bytes > 0; got ${out.bytes}`);
    assert.equal(mock.attempts, 1);
  } finally {
    await closeMock(mock);
  }
});

// 2. 429 twice then 200 → attempts == 3, exit 0.
test("429 × 2 then 200 → retries succeed, attempts == 3", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 429, { error: "slow down" }),
    (req, res) => respondJson(res, 429, { error: "slow down" }),
    (req, res) => respondJson(res, 200, successResponseBody()),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 0,
      `expected exit 0; got ${r.status}; stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.equal(mock.attempts, 3);
  } finally {
    await closeMock(mock);
  }
});

// 3. 500 × 4 → exhausted retries, E_UPSTREAM_5XX, attempts == 4.
test("500 × 4 → E_UPSTREAM_5XX, attempts == 4", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 500, { error: "oops" }),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, false);
    assert.equal(out.code, "E_UPSTREAM_5XX");
    assert.equal(mock.attempts, 4, `expected 4 attempts; got ${mock.attempts}`);
  } finally {
    await closeMock(mock);
  }
});

// 4. 401 → no retry, E_AUTH, attempts == 1.
test("401 → E_AUTH, attempts == 1", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 401, { error: "no auth" }),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_AUTH");
    assert.equal(mock.attempts, 1);
  } finally {
    await closeMock(mock);
  }
});

// 5. 403 admin/workspace → E_ADMIN_DISABLED.
test("403 'Workspace admin disabled' → E_ADMIN_DISABLED", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 403, "Workspace admin disabled image generation"),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_ADMIN_DISABLED");
    assert.equal(mock.attempts, 1);
  } finally {
    await closeMock(mock);
  }
});

// 6. 403 country/region → E_REGION.
test("403 'not supported in your country' → E_REGION", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 403, "service is not supported in your country"),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_REGION");
  } finally {
    await closeMock(mock);
  }
});

// 7. 404 → E_MODEL_NOT_FOUND, attempts == 1.
test("404 → E_MODEL_NOT_FOUND, attempts == 1", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 404, { error: "not found" }),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_MODEL_NOT_FOUND");
    assert.equal(mock.attempts, 1);
  } finally {
    await closeMock(mock);
  }
});

// 8. Retry-After: 2 on 429 → observe Retry-After path was taken.
// We assert BOTH a side-channel (retryAfterSeenCount) and that the wall-clock
// elapsed is >= 1500 ms, confirming the header was honored (base-ms=5 would
// otherwise have retried in ~5-10 ms).
test("429 with Retry-After: 2 header → honored", async () => {
  const mock = await makeMock([
    (req, res, ctx) => {
      ctx.retryAfterSeenCount++;
      respondJson(res, 429, { error: "slow" }, { "Retry-After": "2" });
    },
    (req, res) => respondJson(res, 200, successResponseBody()),
  ]);
  try {
    const startMs = Date.now();
    const r = await runAgainstMock(mock);
    const elapsed = Date.now() - startMs;
    assert.equal(r.status, 0, `stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.success, true);
    assert.equal(mock.attempts, 2);
    assert.equal(mock.retryAfterSeenCount, 1,
      "mock should have served Retry-After exactly once");
    assert.ok(elapsed >= 1800,
      `expected elapsed >= 1800ms (Retry-After: 2); got ${elapsed}ms`);
  } finally {
    await closeMock(mock);
  }
});

// 9. Truncated body: server writes '{"candidates' then closes without
// finishing. Content-Type: application/json AND 200 status → parser fails
// → E_UNEXPECTED_HTTP. Body-parse failure is NOT retried.
test("truncated JSON body on 200 → E_UNEXPECTED_HTTP, no retry", async () => {
  const mock = await makeMock([
    (req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.write('{"candidates');
      res.end();
    },
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_UNEXPECTED_HTTP",
      `expected E_UNEXPECTED_HTTP; got ${out.code}: ${out.error}`);
    assert.equal(mock.attempts, 1,
      `body-parse failures must NOT be retried; got ${mock.attempts} attempts`);
  } finally {
    await closeMock(mock);
  }
});

// 10. AbortSignal.timeout expires on every attempt → E_UPSTREAM_5XX.
// Server sleeps 300ms; client timeout 50ms. Expect 3 total attempts
// (MAX_RETRIES=2 + 1) all abort, then network-exhausted → E_UPSTREAM_5XX.
test("timeout expires on every attempt → E_UPSTREAM_5XX", async () => {
  const mock = await makeMock([
    (req, res) => {
      setTimeout(() => respondJson(res, 200, successResponseBody()), 300);
    },
  ]);
  try {
    const r = await runAgainstMock(mock, {
      NANOGEN_FETCH_TIMEOUT_MS: "50",
      NANOGEN_MAX_RETRIES: "2",
      NANOGEN_RETRY_BASE_MS: "5",
    });
    assert.equal(r.status, 1, `stderr=${r.stderr}; stdout=${r.stdout}`);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_UPSTREAM_5XX");
    assert.ok(mock.attempts >= 1,
      `expected >= 1 attempt; got ${mock.attempts}`);
  } finally {
    await closeMock(mock);
  }
});

// 11. 400 INVALID_ARGUMENT + "content policy" → E_CONTENT_POLICY, no retry.
test("400 INVALID_ARGUMENT + content policy → E_CONTENT_POLICY, no retry", async () => {
  const mock = await makeMock([
    (req, res) => respondJson(res, 400, {
      error: { status: "INVALID_ARGUMENT", message: "violates content policy" },
    }),
  ]);
  try {
    const r = await runAgainstMock(mock);
    assert.equal(r.status, 1);
    const out = parseLastJsonLine(r.stdout);
    assert.equal(out.code, "E_CONTENT_POLICY");
    assert.equal(mock.attempts, 1);
  } finally {
    await closeMock(mock);
  }
});

// 12. mapHttpError direct unit tests (covers every row of the 11-row table).
test("mapHttpError: all 11 rows of the mapping table", () => {
  const GEN = require("../generate.cjs");
  // 400 + INVALID_ARGUMENT + policy → E_CONTENT_POLICY
  assert.equal(
    GEN.mapHttpError(400, JSON.stringify({ error: { status: "INVALID_ARGUMENT", msg: "content policy violation" } })),
    "E_CONTENT_POLICY"
  );
  // 400 + inline_data + size → E_BAD_REQUEST_IMAGE
  assert.equal(
    GEN.mapHttpError(400, "inline_data too large in size"),
    "E_BAD_REQUEST_IMAGE"
  );
  // 400 otherwise → E_BAD_REQUEST
  assert.equal(GEN.mapHttpError(400, "generic 400"), "E_BAD_REQUEST");
  // 401 → E_AUTH
  assert.equal(GEN.mapHttpError(401, ""), "E_AUTH");
  // 403 admin/workspace → E_ADMIN_DISABLED
  assert.equal(GEN.mapHttpError(403, "workspace admin disabled"), "E_ADMIN_DISABLED");
  // 403 country/region → E_REGION
  assert.equal(GEN.mapHttpError(403, "not supported in your country"), "E_REGION");
  // 403 otherwise → E_FORBIDDEN
  assert.equal(GEN.mapHttpError(403, "plain forbidden"), "E_FORBIDDEN");
  // 404 → E_MODEL_NOT_FOUND
  assert.equal(GEN.mapHttpError(404, ""), "E_MODEL_NOT_FOUND");
  // 429 → E_RATE_LIMIT
  assert.equal(GEN.mapHttpError(429, ""), "E_RATE_LIMIT");
  // 500 → E_UPSTREAM_5XX
  assert.equal(GEN.mapHttpError(500, ""), "E_UPSTREAM_5XX");
  assert.equal(GEN.mapHttpError(502, ""), "E_UPSTREAM_5XX");
  assert.equal(GEN.mapHttpError(503, ""), "E_UPSTREAM_5XX");
  // other → E_UNEXPECTED_HTTP
  assert.equal(GEN.mapHttpError(418, "I'm a teapot"), "E_UNEXPECTED_HTTP");
});

// 13. parseRetryAfter unit tests: integer seconds, bounds, non-numeric.
test("parseRetryAfter: integer bounds + non-numeric", () => {
  const GEN = require("../generate.cjs");
  assert.equal(GEN.parseRetryAfter("1"), 1000);
  assert.equal(GEN.parseRetryAfter("60"), 60000);
  assert.equal(GEN.parseRetryAfter("0"), null, "0 seconds rejected");
  assert.equal(GEN.parseRetryAfter("61"), null, "61 > 60s cap");
  assert.equal(GEN.parseRetryAfter("abc"), null, "non-numeric rejected");
  assert.equal(GEN.parseRetryAfter(""), null);
  assert.equal(GEN.parseRetryAfter(null), null);
  assert.equal(GEN.parseRetryAfter("1.5"), null, "non-integer rejected");
});

runAll();
