---
title: /nanogen — Verification Report
created: 2026-04-17
status: user-signed-off
signed-off: 2026-04-18
---

# /nanogen — Verification Report

Snapshot of what's been verified against the live Gemini API, what
fixes surfaced during verification, and what remains for you
(eyeball judgment on three generated images) before the pipeline
can be marked fully complete.

Pipeline commits covered: everything from `ead692a` (SUB_1
complete) through `cda8f35` (gitignore scheduled_tasks.lock).

---

## 1. What I verified on the CLI side

All of the following ran clean against the live Gemini API after
you put your real key in `.env`. Total real-API spend: ~**$0.20**
across 6 generations + 1 retry.

### 1.1. Dry-run smoke test (free)

```
node .claude/skills/nanogen/generate.cjs \
  --prompt "test" --output /tmp/t.png --dry-run
```

- Exit 0, stdout started with `{"dryRun":true,...`.
- Proves install path + Node version (≥ 20.12) + argument parser
  work from the installed location `/workspaces/nanogen/.claude/
  skills/nanogen/`.

### 1.2. Offline test suite in clean env (free)

```
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u NANOGEN_* \
  bash -c 'cd .claude/skills/nanogen && npm test'
```

- Exit 0.
- **171/171 tests passing** across 11 files:
  `test_parse_args.cjs (30)`, `test_styles.cjs (21)`,
  `test_request_builder.cjs (14)`, `test_response_parser.cjs (21)`,
  `test_http_retry.cjs (13)`, `test_env.cjs (15)`,
  `test_history.cjs (9)`, `test_integration.cjs (10)`,
  `test_edit_multi_image.cjs (18)`, `test_multi_turn.cjs (16)`,
  `test_docs_lint.cjs (4)`.
- No key material leaked in output (proves the
  `NANOGEN_DOTENV_PATH` test-isolation fix works).

### 1.3. Generate mode — real API call (~$0.034)

```
nanogen --prompt "a single red apple on a white marble table" \
        --output /tmp/verify-apple.png
```

- Exit 0, 469 KB file written to `/tmp/verify-apple.png`.
- `historyId: apple-f9c4a2b1`; stdout JSON reported
  `"success":true`.
- History row in `.nanogen-history.jsonl` contained a valid
  `thoughtSignature` (load-bearing for the subsequent multi-turn
  test).
- Surfaced the MIME-mismatch behavior: Gemini returned
  `image/jpeg` despite the `.png` extension; pinned stderr
  warning fired correctly.

### 1.4. Edit mode via `--region` (~$0.034)

```
nanogen --image /tmp/verify-apple.jpg \
        --region "change the apple to bright green" \
        --output /tmp/verify-apple-green.jpg
```

- First attempt failed with `E_IMAGE_MIME_MISMATCH` because the
  source file had JPEG bytes under a `.png` name. Renamed the
  source to `.jpg` and retried — succeeded.
- Exit 0, 488 KB output.
- Proves single-image edit path + `--region` natural-language
  inpainting.

### 1.5. Multi-turn continuation (~$0.034)

```
nanogen --history-continue verify-apple-green-ee6bec6c \
        --prompt "add a stem and leaf" \
        --output /tmp/verify-apple-green-leaf.jpg
```

- **First attempt failed with HTTP 400** from Gemini:
  > "Image part is missing a thought_signature in content
  > position 2, part position 1"
- Root cause: our continuation body put `thoughtSignature` in a
  SEPARATE part from the `inlineData`, but Gemini requires them
  on the SAME part object.
- Fix shipped in commit `2e4f4e0` — restructure the builder +
  update 3 golden fixtures + 4 test assertions.
- Retry after fix: exit 0, 637 KB output, history row linked to
  the edit via `parentId: verify-apple-green-ee6bec6c`.

### 1.6. Object replacement (~$0.034)

```
nanogen --image /tmp/verify-knight.jpg \
        --region "replace the sword with a heavy battle axe, same pose and hand position" \
        --output /tmp/verify-knight-axe.jpg
```

- First generated a base knight image (~$0.034), then ran the
  edit.
- Exit 0, 984 KB output. Preserved pose/lighting/composition.
- Proves edit mode works for non-color transformations.

### 1.7. Style transfer (~$0.034)

```
nanogen --image /tmp/verify-knight.jpg \
        --prompt "convert this image into 16-bit SNES-era pixel art, preserve composition, pose, and key visual elements" \
        --style pixel-16bit \
        --output /tmp/verify-knight-16bit.jpg
```

- Exit 0, 844 KB output.
- Proves `--image + --prompt + --style` for free-form restyles.
- Combined with 1.6 proves the full edit-mode matrix (region-
  based local edits + prompt-based global transforms).

---

## 2. Bugs that surfaced during verification + were fixed

| # | Bug | Severity | Commit |
|---|---|---|---|
| 1 | Test-isolation leak — the `resolveApiKey()` `__dirname` walker reached the repo's real `.env` from tempdir-based tests, printing the user's full plaintext key in an assertion-error message. | **Critical** | [`9068612`](/workspaces/nanogen/build/nanogen/generate.cjs) — NANOGEN_DOTENV_PATH hook |
| 2 | `thoughtSignature` placement — our continuation body had it in a sibling part; Gemini requires it on the same part as the inlineData. HTTP 400 every time. | **Critical** | [`2e4f4e0`](/workspaces/nanogen/build/nanogen/generate.cjs) — move sig onto inlineData part |
| 3 | Misplaced `.landed` marker at repo root — reused a worktree-level convention outside its intended scope. | Minor (cosmetic) | [`97c4c6b`](/workspaces/nanogen/.gitignore) — remove + gitignore |
| 4 | Setup-guide inaccuracies — claimed Gemini keys start with `AIza` (research-agent inference from historical examples, not verified; 2026 keys have a new format starting `AQ.A`). | Minor (misleading) | [`40b48ff`](/workspaces/nanogen/reports/nanogen-api-key-setup.md) |
| 5 | `/nanogen` via Claude Code was dumping outputs at repo root instead of `assets/<category>/` like imagegen. SKILL.md lacked the path convention. | Minor (UX) | [`5738960`](/workspaces/nanogen/build/nanogen/SKILL.md) — add convention |
| 6 | Transparency docs were dismissive ("no bitmap masks, period"), ignored the standard chromakey workflow. | Minor (misleading) | [`5d097bd`](/workspaces/nanogen/build/nanogen/reference.md) — chromakey workflow |

Bugs 1 + 2 are the ones that would have bitten any real user. The
others are polish.

---

## 3. Known behavior worth mentioning (not a bug)

**Gemini returns JPEG bytes for most image requests** regardless
of the filename we pass it. The CLI writes bytes-as-returned and
fires a pinned stderr warning:

```
nanogen: output extension ".png" but API returned image/jpeg; bytes written as-is.
```

Observed in **every** generate-mode call during verification
(apple, knight, warrior, frog-meaner). For pixel-art / sprite
work, `.jpg` compression slightly softens the crisp edges —
not a big deal at 2K, noticeable at 1K. The updated SKILL.md
(commit `5738960`) now directs the agent to use `.jpg` for sprite
categories by default, avoiding the rename dance.

---

## 4. What's left for you (eyeball judgment)

Three AI-generated images currently on disk at
`/workspaces/nanogen/assets/sprites/` (gitignored, won't appear
in `git status`). These exist because I ran the verification
above — they are the concrete outputs to inspect. Open them in
any image viewer (VS Code's built-in preview works):

| File | Prompt | What to judge |
|---|---|---|
| [`assets/sprites/warrior_16bit.jpg`](../assets/sprites/warrior_16bit.jpg) | "A 16-bit pixel art warrior holding a huge oversized two-handed sword, full body front-facing heroic pose, armor with clear silhouette. Plain pure white (#FFFFFF) solid background..." via `/nanogen` skill | Is it recognizably 16-bit pixel art? Is there a huge sword? Is the background plain/white enough to chroma-key out? Did JPEG compression harm the crisp pixel edges? |
| [`assets/sprites/frog_large_boss.png`](../assets/sprites/frog_large_boss.png) | (This is your ORIGINAL input image — checking in case you'd like to compare against the meaner edit.) | n/a — reference |
| [`assets/sprites/frog_large_boss_meaner.jpg`](../assets/sprites/frog_large_boss_meaner.jpg) | "Transform this frog boss into an even bigger and meaner version... larger fangs, more aggressive/intense eyes, battle scars, bulkier muscular proportions, heavier armor or spikes, darker more aggressive palette with deep reds and shadows. Preserve the original art style, character identity (still a frog boss)..." | Is the output still recognizably the same frog-boss character? Is it meaningfully bigger/meaner than the original? Did it preserve the source's art style/palette? Or did it drift into a different character entirely? |

If any of these look wrong:
- **Easy fix attempts first:** re-run with a different `--seed`
  (produces a different attempt at the same prompt; ~$0.034 each).
  For the warrior, also consider `--size 2K` to preserve pixel
  edges better.
- **Second-tier fixes:** escalate to `--model
  gemini-3-pro-image-preview` (~$0.134 but higher quality).
- **Prompt issue:** if the problem is consistently the same across
  seeds, the prompt needs tuning — tell me what's wrong and I'll
  suggest a revision.

---

## 5. Sign-off

When the eyeball check passes, say so and I'll:

1. Flip `plans/SUB_3_SKILL_INSTALL.md` frontmatter to
   `status: complete`; update its Phase 3 row from `⊘ Awaiting...`
   to `✅ Done`.
2. Flip `plans/META_IMPLEMENT_A_NANOGEN_SKILL_SIMI.md` frontmatter
   to `status: complete`; update its Phase 3 row the same way.
3. Append a short "user-signed-off YYYY-MM-DD" note to
   `reports/plan-sub-3-skill-install.md` and update the header of
   this doc's frontmatter from
   `status: claude-verified / awaiting-eyeball` to
   `status: user-signed-off`.
4. Nothing else — no push, no release, no auto-commit beyond the
   frontmatter updates.

The repo is already push-ready as of commit `cda8f35` regardless
of whether you sign off. The sign-off is documentation tidy-up,
not a functional gate on anything.
