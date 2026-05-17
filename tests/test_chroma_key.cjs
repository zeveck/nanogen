"use strict";
// Chroma-key transparency unit tests.
//
// Covers the algorithmic core (PNG encode/decode round-trip, JPEG decode,
// keying + alpha-bleed + spill-suppression, error paths). Live API
// integration is intentionally out of scope here — see test_integration.cjs.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const M = require(path.resolve(__dirname, "..", "build", "nanogen", "generate.cjs"));

const FIXTURES_DIR = path.join(__dirname, "fixtures");
// 8×8 solid-magenta JPEG produced with Pillow at quality=95 — a stand-in for
// the JPEG-shaped bytes Gemini returns (real Gemini fixtures should also
// land here under names like gemini-*.jpg as we capture them).
const MAGENTA_JPEG_PATH = path.join(FIXTURES_DIR, "magenta-8x8.jpg");

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

// Make a simple WxH RGBA buffer where pixels matching `keyPredicate(x,y)`
// get color [keyR,keyG,keyB,255], everything else gets [r,g,b,255].
function makeRgba(w, h, keyPredicate, keyRgb, fillRgb) {
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const c = keyPredicate(x, y) ? keyRgb : fillRgb;
      buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; buf[o + 3] = 255;
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// PNG round-trip (encode → parse identity)
// ---------------------------------------------------------------------------

test("encodeRgbaPng → parsePng round-trip preserves pixels", () => {
  const w = 8, h = 6;
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = i & 0xff;
  // Force alpha to 255 so parsePng doesn't promote anything
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = 255;
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  // Magic bytes
  assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
  const parsed = M.parsePng(png);
  assert.equal(parsed.width, w);
  assert.equal(parsed.height, h);
  assert.equal(Buffer.compare(parsed.rgba, rgba), 0,
    "rgba should round-trip byte-for-byte");
});

test("parsePng rejects buffer with bad magic (E_CHROMA_BAD_PNG)", () => {
  const bad = Buffer.from("not a png at all");
  assert.throws(
    () => M.parsePng(bad),
    (e) => e.code === "E_CHROMA_BAD_PNG" && /signature/.test(e.message)
  );
});

test("parsePng rejects truncated buffer", () => {
  const png = M.encodeRgbaPng({
    width: 2, height: 2,
    rgba: Buffer.alloc(16, 0xff),
  });
  assert.throws(
    () => M.parsePng(png.slice(0, 30)),
    (e) => e.code === "E_CHROMA_BAD_PNG"
  );
});

// ---------------------------------------------------------------------------
// chromaKeyAnyImage on PNG input
// ---------------------------------------------------------------------------

test("chroma-key on PNG: magenta pixels become alpha=0, non-key stay opaque", () => {
  const w = 6, h = 6;
  // Top half magenta, bottom half red.
  const rgba = makeRgba(w, h, (x, y) => y < 3, [255, 0, 255], [200, 0, 0]);
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  const r = M.chromaKeyAnyImage(png, "image/png", { chromaKey: "#ff00ff", tolerance: 10 });
  assert.equal(r.stats.removedPixels, 18);    // top 3 rows × 6 cols
  assert.equal(r.stats.retainedVisiblePixels, 18); // bottom 3 rows × 6 cols
  assert.equal(r.stats.chromaKey, "#ff00ff");
  assert.equal(r.stats.tolerance, 10);
  assert.equal(r.stats.width, w);
  assert.equal(r.stats.height, h);
  assert.equal(r.stats.sourceMimeType, "image/png");
  // Decode output to verify per-pixel alpha
  const out = M.parsePng(r.buffer);
  // (0,0) should be transparent (was magenta)
  assert.equal(out.rgba[3], 0);
  // (0,3) i.e. first row of bottom half — should be opaque red
  const bottomOffset = (3 * w + 0) * 4;
  assert.equal(out.rgba[bottomOffset + 3], 255);
  assert.equal(out.rgba[bottomOffset], 200);
});

test("chroma-key: alpha-bleed fills transparent-pixel RGB from nearest opaque", () => {
  const w = 4, h = 4;
  // Make pixel (0,0) magenta, everything else green-ish (not red — keep
  // out of spill heuristic).
  const rgba = makeRgba(w, h, (x, y) => x === 0 && y === 0,
                        [255, 0, 255], [40, 200, 40]);
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  const r = M.chromaKeyAnyImage(png, "image/png", { chromaKey: "#ff00ff", tolerance: 5 });
  assert.equal(r.stats.removedPixels, 1);
  assert.ok(r.stats.alphaBleedPixels >= 1,
    "single transparent pixel should be bled from its opaque neighbor");
  const out = M.parsePng(r.buffer);
  // Pixel (0,0): alpha must be 0, but RGB should now be the neighbor's
  // green color rather than magenta (otherwise compositors see a halo).
  assert.equal(out.rgba[3], 0);
  assert.equal(out.rgba[0], 40);
  assert.equal(out.rgba[1], 200);
  assert.equal(out.rgba[2], 40);
});

test("chroma-key with no matching pixels throws E_CHROMA_NO_MATCH", () => {
  const w = 4, h = 4;
  const rgba = makeRgba(w, h, () => false, [0, 0, 0], [10, 20, 30]);
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  assert.throws(
    () => M.chromaKeyAnyImage(png, "image/png", { chromaKey: "#ff00ff", tolerance: 5 }),
    (e) => e.code === "E_CHROMA_NO_MATCH" &&
           e.details && e.details.chromaKey === "#ff00ff" &&
           e.details.tolerance === 5
  );
});

test("chroma-key rejects invalid hex (E_BAD_CHROMA_KEY)", () => {
  const w = 2, h = 2;
  const rgba = Buffer.alloc(w * h * 4, 0xff);
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  assert.throws(
    () => M.chromaKeyAnyImage(png, "image/png", { chromaKey: "magenta", tolerance: 10 }),
    (e) => e.code === "E_BAD_CHROMA_KEY"
  );
});

test("chroma-key rejects out-of-range tolerance (E_BAD_CHROMA_TOLERANCE)", () => {
  const w = 2, h = 2;
  const rgba = Buffer.alloc(w * h * 4, 0xff);
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  assert.throws(
    () => M.chromaKeyAnyImage(png, "image/png", { chromaKey: "#ff00ff", tolerance: 9999 }),
    (e) => e.code === "E_BAD_CHROMA_TOLERANCE"
  );
});

test("chroma-key rejects unsupported MIME (E_CHROMA_UNSUPPORTED_MIME)", () => {
  const fakeBytes = Buffer.from("RIFF\x00\x00\x00\x00WEBP");
  assert.throws(
    () => M.chromaKeyAnyImage(fakeBytes, "image/webp", { chromaKey: "#ff00ff", tolerance: 10 }),
    (e) => e.code === "E_CHROMA_UNSUPPORTED_MIME"
  );
});

test("auto-expand: dense spill ring just past tolerance triggers a +20 retry", () => {
  // Construct a 32×32 image where most pixels sit at distance ≈ 70 from
  // magenta — past tolerance 60 but inside the fringe band [60, 90]. A
  // sliver of pixels is the "real subject" at distance 200+ (dark grey).
  const w = 32, h = 32;
  const rgba = Buffer.alloc(w * h * 4);
  // Default fringe color: RGB (255, 50, 200) — distance from #ff00ff is
  // sqrt(0 + 2500 + 3025) = ~74. Inside band [60, 90].
  // Subject sliver: dark grey (40, 40, 40) — distance from #ff00ff
  // is sqrt(46225 + 1600 + 46225) = ~306. Well past.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const isSubject = x < 4 && y < 4; // 16 pixels of subject
      if (isSubject) { rgba[o]=40; rgba[o+1]=40; rgba[o+2]=40; rgba[o+3]=255; }
      else           { rgba[o]=255; rgba[o+1]=50; rgba[o+2]=200; rgba[o+3]=255; }
    }
  }
  // Add a pure-magenta block so the initial keying sweep finds something.
  for (let i = 0; i < 8; i++) {
    const o = (28 * w + 28 + i % 4 + (Math.floor(i/4)) * w) * 4;
    rgba[o] = 255; rgba[o+1] = 0; rgba[o+2] = 255; rgba[o+3] = 255;
  }
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  const r = M.chromaKeyAnyImage(png, "image/png");
  assert.equal(r.stats.autoExpanded, true,
    "fringe density of ~95% should trigger auto-expand");
  assert.equal(r.stats.effectiveTolerance, 80,
    "auto-expand bumps by AUTO_EXPAND_STEP (20)");
  assert.ok(r.stats.fringePixelCount > 16);
  // After expansion the fringe pixels should be transparent.
  const out = M.parsePng(r.buffer);
  // Fringe pixel at (10,10) → transparent
  const fringeAlpha = out.rgba[(10 * w + 10) * 4 + 3];
  assert.equal(fringeAlpha, 0, "fringe pixel should be transparent after auto-expand");
  // Subject pixel at (0,0) → opaque
  const subjectAlpha = out.rgba[(0 * w + 0) * 4 + 3];
  assert.equal(subjectAlpha, 255, "real subject should remain opaque");
});

test("auto-expand: clean image (no fringe) does NOT auto-expand", () => {
  const w = 16, h = 16;
  const rgba = Buffer.alloc(w * h * 4);
  // Half magenta, half pure green — green is at distance ≈ 360, no fringe.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (x < w / 2) { rgba[o]=255; rgba[o+1]=0; rgba[o+2]=255; rgba[o+3]=255; }
      else           { rgba[o]=0; rgba[o+1]=255; rgba[o+2]=0; rgba[o+3]=255; }
    }
  }
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  const r = M.chromaKeyAnyImage(png, "image/png");
  assert.equal(r.stats.autoExpanded, false,
    "image without fringe ring should NOT auto-expand");
});

test("auto-expand: caller can disable with autoExpand: false", () => {
  // Same fringe-ring image as the first auto-expand test.
  const w = 32, h = 32;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      rgba[o]=255; rgba[o+1]=50; rgba[o+2]=200; rgba[o+3]=255;
    }
  }
  for (let i = 0; i < 8; i++) {
    const o = (0 * w + i) * 4;
    rgba[o] = 255; rgba[o+1] = 0; rgba[o+2] = 255; rgba[o+3] = 255;
  }
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  const r = M.chromaKeyAnyImage(png, "image/png", { autoExpand: false });
  assert.equal(r.stats.autoExpanded, false,
    "autoExpand: false must honor caller's tolerance verbatim");
});

test("chroma-key uses defaults when chromaKey/tolerance omitted", () => {
  const w = 4, h = 4;
  // Fill with magenta — should match defaults exactly (#ff00ff / 60).
  const rgba = makeRgba(w, h, () => true, [255, 0, 255], [0, 0, 0]);
  // Make at least one non-key pixel so we don't trip "all transparent".
  rgba[0] = 0; rgba[1] = 0; rgba[2] = 0;
  const png = M.encodeRgbaPng({ width: w, height: h, rgba });
  const r = M.chromaKeyAnyImage(png, "image/png");
  assert.equal(r.stats.chromaKey, M.DEFAULT_CHROMA_KEY);
  assert.equal(r.stats.tolerance, M.DEFAULT_CHROMA_TOLERANCE);
  assert.ok(r.stats.removedPixels >= w * h - 1);
});

// ---------------------------------------------------------------------------
// JPEG decode (via vendored jpeg-js)
// ---------------------------------------------------------------------------
//
// We don't have a JPEG encoder bundled (intentionally — we only need to
// decode Gemini's output). The fixture is checked in as a tiny binary
// file: 8×8 solid-magenta JPEG generated with Pillow at quality=95.

test("parseJpeg: decode a tiny solid-magenta JPEG into RGBA", () => {
  const jpeg = fs.readFileSync(MAGENTA_JPEG_PATH);
  // Magic bytes start with FFD8FF
  assert.equal(jpeg.slice(0, 3).toString("hex"), "ffd8ff");
  const parsed = M.parseJpeg(jpeg);
  assert.equal(parsed.width, 8);
  assert.equal(parsed.height, 8);
  assert.equal(parsed.rgba.length, 8 * 8 * 4);
  // JPEG lossy compression means colors won't be exactly (255,0,255) — but
  // every pixel should be in the magenta neighborhood and alpha should be 255.
  for (let p = 0; p < 64; p++) {
    const o = p * 4;
    assert.equal(parsed.rgba[o + 3], 255, `pixel ${p} alpha should be 255`);
    assert.ok(parsed.rgba[o] > 200,     `pixel ${p} R should be ≈ 255, got ${parsed.rgba[o]}`);
    assert.ok(parsed.rgba[o + 1] < 60,  `pixel ${p} G should be ≈ 0,   got ${parsed.rgba[o + 1]}`);
    assert.ok(parsed.rgba[o + 2] > 200, `pixel ${p} B should be ≈ 255, got ${parsed.rgba[o + 2]}`);
  }
});

test("parseJpeg rejects non-JPEG bytes (E_CHROMA_BAD_JPEG)", () => {
  const bogus = Buffer.from("definitely not a jpeg file here");
  assert.throws(
    () => M.parseJpeg(bogus),
    (e) => e.code === "E_CHROMA_BAD_JPEG"
  );
});

// ---------------------------------------------------------------------------
// End-to-end: JPEG input → chroma-keyed PNG output
// ---------------------------------------------------------------------------

test("chromaKeyAnyImage(JPEG): solid-magenta JPEG transcodes to a fully-transparent PNG", () => {
  // When every pixel is keyed away, alpha-bleed has no source — the
  // keying step itself still succeeds (removedPixels > 0) and the result
  // is a valid PNG with all alpha=0. Use a higher tolerance to absorb
  // JPEG compression spread around the magenta key.
  const jpeg = fs.readFileSync(MAGENTA_JPEG_PATH);
  const r = M.chromaKeyAnyImage(jpeg, "image/jpeg",
    { chromaKey: "#ff00ff", tolerance: 60 });
  assert.equal(r.stats.sourceMimeType, "image/jpeg");
  assert.ok(r.stats.removedPixels >= 1);
  // Output bytes should be a valid PNG with the correct dimensions.
  const out = M.parsePng(r.buffer);
  assert.equal(out.width, 8);
  assert.equal(out.height, 8);
  // Every pixel should have alpha=0 since the whole fixture is magenta-ish.
  for (let p = 0; p < 64; p++) {
    assert.equal(out.rgba[p * 4 + 3], 0,
      `pixel ${p} should be transparent in the all-magenta JPEG fixture`);
  }
});

// ---------------------------------------------------------------------------

runAll();
