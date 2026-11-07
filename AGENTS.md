# Agent instructions

Coding standards for agents. Domain vocabulary: [CONTEXT.md](./CONTEXT.md). Architecture: the developer pages in [apps/docs/src/content/dev](./apps/docs/src/content/dev) (served at `/dev`); each lists the code it describes in its `sources:` frontmatter.

When behavior changes, update the developer page whose `sources:` cover the file you changed. Architecture belongs in those pages, not in READMEs below a package root. Package READMEs cover install and overview; update one when its package's public use changes. Use CONTEXT.md terms consistently. User-facing public package changes also need a changeset (`pnpm changeset`); do not hand-edit package versions or `CHANGELOG.md` for release notes.

## Board

The GitHub project is [ecopages](https://github.com/orgs/ecopages/projects/2) (organization `ecopages`, number 2). Status field: in progress is `In progress`, in review is `In review`, done is `Done`. Integration branch: `next`; open feature and fix PRs with `--base next`, since `main` stays the GitHub default. GitHub closes `Closes #n` issues only for PRs merged into the default branch, so `.github/workflows/close-issues.yml` closes them when a PR merges into `next`: write one `Closes #n` per issue, and `Refs #n` when the PR does not resolve it. `main` is what is released: a release is a PR from `next` into `main`, and a hotfix branches from `main` and targets it.

## Comments

- No inline `//` for non-obvious behavior — document on the declaration with TSDoc.
- TSDoc only when it adds info beyond the name; never restate the method/class/function.
- Use `@remarks` for rationale, edge cases, and workarounds (`@remarks`-only blocks are fine).
- Skip TSDoc on trivial or self-explanatory code.

## Formatting

- Do not hand-fix style or linter formatting; format-on-save handles it.
- Prefer template literals over string concatenation.
- No emoji; use plain text (e.g. `[check]`).

## TypeScript

- Avoid `any`; prefer `unknown`. If `any` is unavoidable, explain in `@remarks`.
- Fix linter issues; do not ignore or suppress without cause.
- Avoid TypeScript hacks and anti-patterns.

## Design

- Fix the cause, not the symptom.
- Before 1.0, breaking changes ship as `minor`; prefer the clean change over an alias, fallback or compatibility path.
- Filesystem access goes through `@ecopages/file-system`; extend it when a capability is missing.
