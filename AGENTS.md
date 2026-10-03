# Agent instructions

Coding standards for agents. Domain vocabulary: [CONTEXT.md](./CONTEXT.md). Architecture: README beside the code you edit; index at [packages/core/README.md](./packages/core/README.md).

When behavior changes, update that folder's README and any parent index that lists it. Use CONTEXT.md terms consistently. User-facing public package changes also need a changeset (`pnpm changeset`); do not hand-edit package versions or `CHANGELOG.md` for release notes.

Contributor skills (reviews, tests, commits, GitHub) live in [.agents/skills](./.agents/skills/README.md). The generic ones work in any repository; the `ecopages` skill maps where this repository keeps the commands and conventions they need. Run `pnpm init:dev` to link them for Claude Code and Cursor.

## Tracking work

- GitHub issues are the source of truth for planned work. There is no local plan file. Every GitHub action goes through the `github-cli` skill.
- Agents create issues only from draft files with `pnpm issue <draft.md>`, which validates them against the issue forms and labels in `.github/`.
- Milestones name the release line: fixes go to the current patch line (for example `0.2.x`), structural refactors to the next minor (for example `0.3.0`).
- A program is one `tracking` issue with each change as a sub-issue. Order work with "blocked by" links.
- One PR per issue, against `develop`, using `.github/pull_request_template.md` with `Closes #N`. Stack PRs when one depends on another.
- Issues must stand alone: link code at a commit SHA, never to local or gitignored files such as `.audit/`.

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
