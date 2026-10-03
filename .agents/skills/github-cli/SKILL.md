---
name: github-cli
description: Every GitHub action through the gh CLI, following the repository's own schema in .github/. Use to create issues from draft files (validated by a script, never by hand), plan a program of issues, open and stack pull requests, read CI checks and review comments, answer a review, merge, and close issues.
---

# GitHub CLI

Every agent does GitHub work the same way: formats come from the repository's `.github/` folder, steps from the files below. Do not improvise a format, label or command they already define.

**Project specifics** (the integration branch, the merge method, milestone and label conventions, an alias for the issue script) come from the project's `AGENTS.md` and the project skill it names. If neither says, the integration branch is the default branch: `gh repo view --json defaultBranchRef`.

## Rules

- **Ask first.** Pushing, creating or editing issues and PRs, commenting and merging all publish to a shared repository. Do them only after the user approves, unless they asked for that exact action.
- **Issues come from draft files.** Write a draft and run the issue script below. Never call `gh issue create` by hand: the script validates the draft against the issue forms and labels, then sets the type, labels, milestone, parent and "blocked by" links.
- **The schema is in `.github/`.** The forms in `.github/ISSUE_TEMPLATE/` define each kind of issue and its sections. `.github/labels.yml`, when present, lists the allowed labels. `.github/pull_request_template.md` is the PR body. Read them; do not restate them.
- **Keep scratch files out of the tree.** Write drafts and PR bodies to a temp or gitignored folder so they are never committed.
- **Never** put a token on the command line, force-push a shared branch, or link a local or gitignored file from an issue or PR.

## Load what the task needs

| Task | Read |
|------|------|
| Create one or many issues, a tracking program or a decision; read a program's state | [references/issues.md](references/issues.md) |
| Split work, push, open or stack a PR, retarget, merge, close the issues | [references/pull-requests.md](references/pull-requests.md) |
| Read CI results, failed logs, review comments; answer a review | [references/checks-and-reviews.md](references/checks-and-reviews.md) |

## Issue script

[scripts/create-issues.mts](scripts/create-issues.mts) validates drafts and, with `--apply`, creates them. Run it from inside the repository with Node 22.6 or later, or through the project's alias when it has one:

```sh
node --experimental-strip-types <this skill's folder>/scripts/create-issues.mts <file.md | folder> [more files] [--repo owner/name] [--forbid a,b] [--apply]
```

Without `--apply` it only validates and prints what it would create, with each issue's labels and milestone. `<issue script>` in the references means this command.
