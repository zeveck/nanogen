---
title: /nanogen — API Key Setup & Verification Guide
created: 2026-04-17
status: awaiting-user-verification
---

# /nanogen — API Key Setup & Verification Guide

> Zero-to-working in under 5 minutes. Read this top-to-bottom on first
> install; thereafter, jump straight to section 9 (verification
> checklist) when you need to re-validate.

---

## 1. TL;DR

```text
1. Get a key:  https://aistudio.google.com/app/apikey
2. Set env:    export GEMINI_API_KEY=<your-key>
3. Test:       node .claude/skills/nanogen/generate.cjs --prompt test --output /tmp/t.png --dry-run
```

The dry-run in step 3 needs no key and spends nothing. Real
generations cost as little as ~$0.022 each (see section 5).

---

## 2. Getting a key

1. Open https://aistudio.google.com/app/apikey and sign in with any
   Google account (personal Gmail recommended — enterprise Workspace
   accounts can be admin-disabled; see section 6).
2. Click **"Create API key"**. Pick an existing Google Cloud project
   or let AI Studio create one for you.
3. Copy the key. It starts with `AIza...`.

**Treat it as a secret.** This key authorises paid usage on your
account. Never commit it to git, paste it into screenshots, or share
it in chat. If it leaks, revoke it immediately at the same URL and
generate a new one.

---

## 3. Setting the env var

Pick whichever fits your workflow. The `/nanogen` CLI looks up
`GEMINI_API_KEY` first, then falls back to `GOOGLE_API_KEY` (with a
stderr warning recommending you switch).

### Interactive shell (current session only)

```bash
export GEMINI_API_KEY="AIza..."
```

Lasts until you close the terminal.

### Persistent (every new shell)

Append to your shell rc file:

```bash
# bash
echo 'export GEMINI_API_KEY="AIza..."' >> ~/.bashrc
# zsh
echo 'export GEMINI_API_KEY="AIza..."' >> ~/.zshrc
```

Reload with `source ~/.bashrc` (or `source ~/.zshrc`).

### Project-scoped `.env`

Create a file named `.env` in the repo root (or any ancestor
directory of your cwd) with:

```text
GEMINI_API_KEY=AIza...
```

The CLI walks up the directory tree from cwd to find a `.env`, so
this works whether you run it from `/workspaces/nanogen/`, a
sub-directory, or a worktree.

**DO NOT commit `.env` to git.** Confirm your `.gitignore` contains
the line `.env` (a one-line check):

```bash
grep -q '^\.env$' .gitignore || echo '.env' >> .gitignore
```

### Note on `GOOGLE_API_KEY`

If you already have `GOOGLE_API_KEY` set for other Google tooling,
the CLI will use it but emit this warning to stderr:

```text
nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.
```

To silence the warning, set `GEMINI_API_KEY` instead.

---

## 4. Testing the key (in order)

Run these in order. Each step costs more than the previous; stop at
the first failure and consult section 10.

### 4a. Dry-run (free, no key needed) — smoke test

```bash
node .claude/skills/nanogen/generate.cjs \
  --prompt "test" --output /tmp/t.png --dry-run
```

**Expected:** stdout begins with `{"dryRun":true,...`, exit code 0.
This proves the CLI installed correctly and your Node version is
recent enough.

### 4b. Real generate (~$0.034) — cheapest tier

```bash
node .claude/skills/nanogen/generate.cjs \
  --prompt "a single red apple on a white background" \
  --output /tmp/apple.png \
  --model gemini-3.1-flash-image-preview --size 1K
```

**Expected:** PNG file at `/tmp/apple.png`, exit code 0, stdout JSON
with `"success":true`.

If exit 1: check the `code` field in stdout JSON.
- `E_MISSING_API_KEY` — env var not set; redo section 3.
- `E_REGION` — your account's region cannot use the Gemini API; see
  section 6.
- `E_ADMIN_DISABLED` — your Workspace admin disabled image gen; see
  section 6.

### 4c. Real edit (~$0.034) — proves edit mode

Uses the file you just generated as input.

```bash
node .claude/skills/nanogen/generate.cjs \
  --image /tmp/apple.png \
  --region "change the apple to green" \
  --output /tmp/apple-green.png
```

**Expected:** PNG file at `/tmp/apple-green.png`. Open both images;
the apple's colour should be the only material difference.

### 4d. Multi-turn continuation (~$0.034) — proves thoughtSignature round-trip

Continuation re-uses the previous turn's `thoughtSignature` so the
model can refine without losing context. Pull the most recent
history id and continue from it:

```bash
ID=$(tail -1 .nanogen-history.jsonl | node -e \
  'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
node .claude/skills/nanogen/generate.cjs \
  --history-continue "$ID" \
  --prompt "add a stem and leaf" \
  --output /tmp/apple-green-leaf.png
```

**Expected:** PNG with the green apple plus a stem and leaf. If you
see `E_CONTINUE_NO_SIGNATURE`, your prior turn used a non-Gemini-3
model — re-run 4b with `--model gemini-3.1-flash-image-preview` (the
default already meets this).

---

## 5. Pricing (April 2026)

Current per-image rates:

| Model | Size | $/image |
|---|---|---|
| `gemini-3-pro-image-preview` | 1K / 2K | $0.134 |
| `gemini-3-pro-image-preview` | 4K | $0.24 |
| `gemini-3.1-flash-image-preview` | 512 | $0.022 |
| `gemini-3.1-flash-image-preview` | 1K | $0.034 |
| `gemini-3.1-flash-image-preview` | 2K | $0.050 |
| `gemini-3.1-flash-image-preview` | 4K | $0.076 |
| `gemini-2.5-flash-image` (GA, **shutdown 2026-10-02**) | 1K | $0.039 |

**Free tier:** AI Studio offers a limited free quota on
`gemini-3.1-flash-image-preview`. The exact daily/per-minute caps
vary by account and change without notice — check
https://aistudio.google.com/rate-limit for your current limits.

**Cost rule of thumb:** ten images at Pro 4K is ~$2.40. Ten images
at Flash 1K is ~$0.34. Default to Flash unless you specifically need
Pro's reliability at 4K or for text-in-image work.

---

## 6. Regional availability & restrictions

**Supported:** 200+ countries including all EU member states and the
UK. The Gemini API checks the region of the **calling host** (your
machine or VM), not your billing address.

**Not supported:** sanctioned countries, including Russia, Iran,
North Korea, Syria, Cuba, and mainland China. Calls from these
regions return `E_REGION` ("service is not supported in your
country").

**Workspace (enterprise Google) accounts** may have image generation
disabled by an organisation administrator. Symptom:
`E_ADMIN_DISABLED` on every call. Two fixes:

1. Ask your Workspace admin to enable image generation for your
   account.
2. Generate the API key from a personal Gmail account instead.

---

## 7. SynthID watermarking

Every image generated by Nano Banana carries an **invisible SynthID
watermark** in pixel data. Key facts:

- This is **not** the visible Gemini-logo overlay you may have seen
  in the consumer Gemini app. API outputs have **no visible
  overlay** — the image looks identical to a human-authored one.
- The watermark survives **light editing** (cropping, resizing,
  modest colour adjustments, format conversion to other lossy
  formats).
- It can be **damaged or destroyed** by aggressive re-encoding,
  heavy compression, or extensive re-rendering (e.g. running through
  another generative model).
- You **cannot disable** it via any flag or model setting.

**Practical takeaway:** assume that any image you ship to production
via this CLI is identifiable as AI-generated by anyone running a
SynthID detector (Google publishes one; others exist). Disclose AI
origin where required by your jurisdiction or platform policy.

---

## 8. Invoking /nanogen after setup

Two equivalent surfaces:

### Direct CLI

```bash
node .claude/skills/nanogen/generate.cjs [flags]
```

Use `--help` for the full flag list. Useful for scripting, CI, or
when you want exact control over every parameter.

### Via Claude Code

```text
/nanogen <prompt>
```

The `/nanogen` skill is now registered (see
`.claude/skills/nanogen/SKILL.md`). Claude reads your prompt, picks
appropriate styles from the 72-preset catalog, infers asset-type
defaults (size/aspect/model), and invokes the CLI for you.

For iteration verbs (`"try again"`, `"go back to v1"`, `"make it
bluer"`, `"apply this style to my photo"`) and the full style
selection algorithm, see `.claude/skills/nanogen/SKILL.md`. For the
complete style catalog, error code reference, and request templates,
see `.claude/skills/nanogen/reference.md`.

---

## 9. End-to-end verification checklist

Copy this entire block into a fresh shell and paste. Total spend
~$0.07 (two real generations).

```bash
# 1. Env check
[ -n "$GEMINI_API_KEY" ] || echo "GEMINI_API_KEY not set"

# 2. Dry-run (offline, free)
node .claude/skills/nanogen/generate.cjs \
  --prompt test --output /tmp/x.png --dry-run

# 3. Full test suite (offline) — run in a CLEAN env so the
#    env-resolution tests aren't polluted by any GEMINI_API_KEY
#    you may have exported elsewhere.
env -u GEMINI_API_KEY -u GOOGLE_API_KEY -u NANOGEN_API_BASE \
    -u NANOGEN_RETRY_BASE_MS -u NANOGEN_FETCH_TIMEOUT_MS \
    -u NANOGEN_MAX_RETRIES \
  bash -c '( cd .claude/skills/nanogen && npm test )'

# 4. One real generate (~$0.034)
node .claude/skills/nanogen/generate.cjs \
  --prompt "red apple" --output /tmp/apple.png \
  --model gemini-3.1-flash-image-preview --size 1K

# 5. One real edit (~$0.034)
node .claude/skills/nanogen/generate.cjs \
  --image /tmp/apple.png --region "make it green" \
  --output /tmp/green.png
```

**Expected outcome:** 5 green checkmarks (no error output, exit
code 0 from each step). Total spend ≤ $0.07.

After all 5 pass, report back to the orchestrator so the pipeline
can proceed to landing. Until then, the install commit sits with a
`.landed` marker reading `status: not-landed`.

---

## 10. Troubleshooting

Every CLI failure exits 1 with a JSON object on stdout containing
`{"success":false,"code":"E_*","error":"..."}`. The `code` field is
the stable identifier; the `error` text may evolve.

| Exit code | What you'll see in `error` | Likely cause | Fix |
|---|---|---|---|
| `E_MISSING_API_KEY` | "GEMINI_API_KEY environment variable is not set..." | Env var not set in current shell | `export GEMINI_API_KEY=AIza...` (section 3) |
| `E_REGION` | "service is not supported in your country" / 400 with region body | Calling host is in a sanctioned region | VPN to a supported region OR run from a host in EU/UK/US/etc. |
| `E_ADMIN_DISABLED` | "Workspace admin has disabled..." / 403 | Enterprise Google account locked by org policy | Ask Workspace admin to enable image gen, or use a personal Gmail key |
| `E_MODEL_NOT_FOUND` | 404 from Gemini for the requested model | Wrong/typo'd `--model` value, or model deprecated | Use one of: `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`. Check SKILL.md for the current known list |
| `E_CONTENT_POLICY` | "content policy" / 400 INVALID_ARGUMENT with policy text | Prompt blocked by Gemini's input filter | Rephrase: avoid named real people, copyrighted characters, violence, sexual content |
| `E_RATE_LIMIT` | 429 after the CLI's retry budget exhausted | Free-tier or paid quota exceeded | Wait (retry budget is 3 attempts with backoff), upgrade tier at AI Studio, or switch to a cheaper model/size |
| `E_AUTH` | 401 from Gemini | API key invalid, revoked, or mistyped | Regenerate at https://aistudio.google.com/app/apikey and re-export |
| `E_REFUSED` | "model returned no image" (text-only response, possibly with `finishReason: SAFETY`) | Soft refusal: model accepted the request but declined to generate | Rephrase per SKILL.md "Refusal recovery"; do NOT retry the same prompt |
| `E_NODE_TOO_OLD` | "nanogen requires Node 20.12+" | Node version lower than 20.12 | Upgrade Node to ≥ 20.12 (uses built-in `fetch`, `FormData`, `process.loadEnvFile`) |
| `E_REGION_WITHOUT_IMAGE` | "--region requires --image" | Used `--region` without `--image` (region is edit-only) | Add `--image <path>` OR drop `--region` (use `--prompt` instead for generate mode) |
| `E_EDIT_NEEDS_INSTRUCTION` | "edit mode requires --prompt or --region" | Passed `--image` with no `--prompt` and no `--region` | Add `--prompt "<instruction>"` or `--region "<description>"` so the model has something to do |
| `E_CONTINUE_UNKNOWN_ID` | "no history entry with id <id>" | `--history-continue <id>` references an id not in `.nanogen-history.jsonl` (wrong cwd, typo, or fresh checkout) | `tail -1 .nanogen-history.jsonl` to grab a valid id; ensure you're in the cwd where the prior generation ran |
| `E_CONTINUE_MISSING_OUTPUT` | "prior output file not found: <path>" | The output file from the previous turn (referenced in history) has been deleted or moved | Re-run the original generate; the new history id can be used for `--history-continue`. Avoid `/tmp/` if you need long-lived continuations |
| `E_CONTINUE_NO_SIGNATURE` | "history entry has no thoughtSignature" | Prior turn used a non-Gemini-3 model (e.g. `gemini-2.5-flash-image`) or a legacy row predates signature capture | Regenerate with `gemini-3.1-flash-image-preview` or `gemini-3-pro-image-preview`, then continue from the new entry |

For the full list of error codes (including arg-validation codes
like `E_BAD_ASPECT`, `E_BAD_SIZE`, `E_IMAGE_MIME_MISMATCH`, and HTTP
codes like `E_BAD_REQUEST_IMAGE`, `E_UPSTREAM_5XX`), see the
**Error code reference** section of
`.claude/skills/nanogen/reference.md`.

---

## Uninstall

If you want to remove the skill (the install is fully reversible):

```bash
rm -rf .claude/skills/nanogen
git restore .claude/settings.local.json .claude/zskills-config.json
# build/nanogen/ is the dev source — keep or delete as you prefer
```

This removes the installed skill, restores the two settings files
to their pre-install state, and leaves the development source tree
at `build/nanogen/` untouched (so you can re-install later via
`rsync -a --exclude=tools/ build/nanogen/ .claude/skills/nanogen/`).
