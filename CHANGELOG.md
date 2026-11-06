# Changelog

nanogen uses the release date as its version: `vYYYY.M.D` (for example
`v2026.10.11`). A second release on the same day adds `.2`, a third `.3`, and
so on (`v2026.10.11.2`).

The running version is shown by `--help` and `--version`, and recorded as
`nanogenVersion` in every JSON result and every `.nanogen-history.jsonl` entry.

## v2026.11.6

Model update (checked against Google's docs and the live API on 2026-11-06):

- The default model is now Nano Banana 2.1 (`gemini-nano-banana-2.1`), and
  the `flash` alias points at it. Google deprecated the old default,
  `gemini-3.1-flash-image`, on 2026-10-06 and names 2.1 as its replacement.
  The old model still works by full name, and is still the only one with
  `--size 512`.
- New `lite` alias for Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`):
  fastest and cheapest, weaker with several references and multi-turn edits.
- Size and thinking-level checks now follow each model's real limits, so a
  bad combination fails before the API call. 2.1 takes 1K/2K/4K and thinking
  `minimal`/`medium`/`high`; Lite takes 1K/2K/4K and `minimal`/`high`;
  `gemini-3.1-flash-image` takes `minimal`/`high` (it used to let `low` and
  `medium` through, which the API refuses).
- `--list-models` now shows Nano Banana 2.1; its id has no "image" in it.

## v2026.11.1.2

Fixes from a second bug review ([#5](https://github.com/zeveck/nanogen/issues/5)):

- `--history-continue` skips a newer refused attempt and continues from the
  last good image. (A refusal saves no image, so the good one is still there.)
- `--list-models` follows Gemini's paging, so models past the first page are
  no longer left out.

## v2026.11.1

Fixes from a bug review ([#4](https://github.com/zeveck/nanogen/issues/4)):

- `--history-continue` now continues from the newest history entry with that
  id. Saving to the same path twice made two entries with one id, and the old
  (sometimes refused) one was used.
- Transparent images are recorded as PNG in the history, matching the file on
  disk, so continuing from them sends the right image type.
- `NANOGEN_MAX_RETRIES=0` now means one attempt with no retries.
- `--help` names the right alias for the default model (`flash`).

## v2026.10.11

First versioned release. Generation behavior, flags, and defaults are
unchanged.

- nanogen is now a Claude Code plugin with its own marketplace:
  `/plugin install nanogen --marketplace zeveck/nanogen`. Installed copies
  update with `claude plugin update nanogen@nanogen`. The plugin is rooted
  at `skills/`, so an install copies only the skill, not the repository.
- The skill moved from `.claude/skills/nanogen/` to `skills/nanogen/`, and its
  `SKILL.md` runs the bundled CLI through `${CLAUDE_SKILL_DIR}`, so it works
  from a plugin install or a copied folder. Links to the old
  `.claude/skills/nanogen` folder no longer resolve. The manual install in the
  README uses the new path and now lists every file the CLI needs, including
  `vendor/jpeg-decoder.js`.
- `SKILL.md` gives the API key setup steps inline, since the repo's
  `reports/` folder isn't part of an install.
- Added the MIT `LICENSE` file the README already described.
- New `--version` flag prints just the version, `--help` shows it, and every
  JSON result, error, and history entry carries a `nanogenVersion` field.
- Dev container refreshed to the shared zeveck template (agent history,
  memory, settings, and plugins kept across rebuilds but not sign-ins,
  `auth`/`dc` helpers). Generated or personal files (`.playwright/`,
  `.claude/skills/playwright-cli/`, `.claude/settings.local.json`) are no
  longer tracked.
- Tests now check that the CLI version, `package.json`, plugin manifest, and
  this changelog agree, and that a project `.env` is found when the CLI runs
  from a subfolder.

## Before v2026.10.11 — unversioned releases installed by copying the skill folder

Earlier releases had no version number and were installed by copying
`.claude/skills/nanogen/` into a project.
