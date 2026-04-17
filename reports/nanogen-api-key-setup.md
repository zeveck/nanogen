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

1. **Get a key** at https://aistudio.google.com/app/apikey →
   click "Create API key" → "Create API key in new project".
   (AI Studio auto-creates a GCP project for you; no Cloud Console
   setup needed. See section 2 for detail.)
2. **Put it in `.env`** (matches imagegen's pattern):
   ```bash
   echo 'GEMINI_API_KEY=AIza...YOUR-KEY...' > /workspaces/nanogen/.env
   grep -q '^\.env$' /workspaces/nanogen/.gitignore \
     || echo '.env' >> /workspaces/nanogen/.gitignore
   ```
3. **Tell me you're ready.** I'll verify the implementation end-to-
   end (~$0.10 spend). Once clean, you test the skill via
   `/nanogen <prompt>` in Claude Code.

---

## 2. Getting a key

### Do I need to create a Google Cloud project first?

**No.** AI Studio is designed so you can get an API key without
pre-provisioning anything in Google Cloud. When you click "Create
API key", AI Studio offers two choices:

- **"Create API key in new project"** — AI Studio auto-creates a
  Google Cloud project for you (typically named
  `Generative Language Client` or similar) and puts the key in it.
  **Pick this if you don't already have a GCP project and don't
  want to deal with Cloud Console.** This is the recommended path
  for new users. You will not see a billing prompt; the free-tier
  quota is available immediately.
- **"Create API key in existing project"** — only useful if you
  already manage GCP projects (for team billing, IAM, or auditing).

For basic Gemini API use — including everything `/nanogen` does —
the auto-created project is fine. You do **not** need to:
- Enable any specific GCP API manually (AI Studio handles this)
- Set up a service account or OAuth client
- Install `gcloud` or the Google Cloud SDK
- Configure IAM roles

### Step-by-step

1. **Sign in.** Open https://aistudio.google.com/ and sign in with
   any Google account. Personal Gmail is the easiest path. Avoid
   enterprise Google Workspace accounts if possible — IT admins
   often disable the Gemini API at the organization level, which
   surfaces later as `E_ADMIN_DISABLED`. If you must use a Workspace
   account, ask your admin to enable "Generative Language API" for
   your user (see section 6).

2. **Accept terms.** First-time visitors get a one-screen terms-of-
   service acceptance. Agree to continue.

3. **Go to the API-key page:**
   https://aistudio.google.com/app/apikey
   (bookmark this — same URL for revoking or rotating keys later.)

4. **Click "Create API key"** (the prominent button near the top).

5. **Choose "Create API key in new project"** for first-time users.
   The page creates the project in the background and returns the
   key within a second or two.

6. **Copy the key immediately.** It starts with `AIza...` and is
   ~40 characters long. The dialog shows the plaintext once;
   afterwards the page only shows a masked preview like
   `AIza...XyZ`. If you lose the plaintext, generate a new key — you
   can't recover the old one.

7. **(Optional) Rename the key** on the AI Studio page for
   bookkeeping (e.g. `nanogen-dev`). Useful once you have several.

### Free tier vs paid tier

- **Free tier** is on by default for personal Google accounts in
  supported countries. Quota is limited (a few requests per minute
  on the image-preview models). Enough for the verification
  checklist below and casual use.
- **Paid tier** (higher RPM/TPM, production use) requires enabling
  billing on the project. Go to
  https://aistudio.google.com/rate-limit → **Upgrade plan** → link
  an existing Cloud billing account or create one. The upgrade
  happens at the project level — this is why project choice
  matters: billing lives on the project, not on the key itself.
- Check your current tier and limits anytime at
  https://aistudio.google.com/rate-limit.

If you hit `E_RATE_LIMIT` during normal use, the fix is usually
upgrading to paid tier for that project, not generating a new key.

### Security

**Treat the key as a secret.** It authorises paid usage on your
account up to whatever quota you've enabled. Never:
- Commit it to git (even a private repo — assume it's leaked the
  moment it enters history)
- Paste it into screenshots, chat, or bug reports
- Share it across machines via email/Slack — use your password
  manager or a `.env` file kept out of version control

If it leaks, revoke it immediately at
https://aistudio.google.com/app/apikey (there's a delete icon next
to each key) and generate a new one. Google does not bill you for
anything after revocation.

---

## 3. Setting the env var

The CLI looks up `GEMINI_API_KEY` first, falls back to
`GOOGLE_API_KEY` (with a stderr warning). Three ways to set it —
pick one.

### ⭐ Recommended: project-scoped `.env` (matches imagegen)

Create a file named `.env` at `/workspaces/nanogen/.env`:

```bash
echo 'GEMINI_API_KEY=AIza...YOUR-KEY-HERE...' > /workspaces/nanogen/.env
grep -q '^\.env$' /workspaces/nanogen/.gitignore || echo '.env' >> /workspaces/nanogen/.gitignore
```

The CLI walks up the directory tree from cwd looking for `.env`, so
this works whether you invoke from the repo root, a subdirectory,
or a worktree. Same pattern as `github.com/zeveck/imagegen`.

**Why this is the default:**
- Survives shell restarts without editing `~/.bashrc`
- Doesn't enter your shell history
- Gitignored by default (safer against accidental commits)
- Scoped to this project — doesn't leak into other repos
- Works the same whether you invoke via `/nanogen` in Claude Code
  or run the CLI directly

### Alternative 1: persistent shell env

Append to your shell rc file if you want the key available in ALL
shells / projects:

```bash
# bash
echo 'export GEMINI_API_KEY="AIza..."' >> ~/.bashrc
# zsh
echo 'export GEMINI_API_KEY="AIza..."' >> ~/.zshrc
```

Reload with `source ~/.bashrc` (or `source ~/.zshrc`). Only use
this if you want the key everywhere on this machine; otherwise the
`.env` approach is tidier.

### Alternative 2: one-off export (current shell only)

```bash
export GEMINI_API_KEY="AIza..."
```

Lasts until you close the terminal. Fine for a single ad-hoc test.

### Note on `GOOGLE_API_KEY`

If you already have `GOOGLE_API_KEY` set for other Google tooling,
the CLI will use it but emit this warning to stderr:

```text
nanogen: using GOOGLE_API_KEY. Prefer GEMINI_API_KEY to match Gemini docs.
```

To silence the warning, set `GEMINI_API_KEY` instead.

---

## 4. Verification flow

Simple. After you put the key in `.env` (section 3), tell me
you're ready and I'll verify the implementation:

- Dry-run (free) — smoke test
- Offline test suite in a clean env — 168 tests must pass
- One real generate (~$0.034) — proves the full HTTP / auth /
  response-parse / file-write / history chain
- One real edit via `--region` (~$0.034) — proves edit mode
- One multi-turn continuation (~$0.034) — proves
  `thoughtSignature` round-trip (the load-bearing Gemini-3
  property)

Total spend: ~$0.10. If anything fails I'll stop and we'll look at
it together (see section 10).

Once I report the impl is clean, you test the skill surface in
Claude Code — `/nanogen <prompt>`, try an edit, try an iteration
like "make it bluer". That's the real UX test.

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

## 9. Sign-off

Once the key is in `.env` and I've reported clean on the
verification steps from section 4, try the skill yourself:

```text
/nanogen <whatever you want>
```

A few follow-ups (`/nanogen edit ...`, `/nanogen make it bluer`)
exercise edit mode and iteration. When you're satisfied, say so
and I'll:

1. Flip `plans/SUB_3_SKILL_INSTALL.md` frontmatter to
   `status: complete`
2. Flip `plans/META_IMPLEMENT_A_NANOGEN_SKILL_SIMI.md` Phase 3 to
   ✅ Done and frontmatter to `status: complete`
3. Rewrite `.landed` from `status: not-landed` to `status: landed`

Until you sign off, the install commit sits with
`.landed: status: not-landed` — the pipeline's explicit guard
against auto-completion.

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
