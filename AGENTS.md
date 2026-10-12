# Agent instructions

Coding standards for agents. Domain vocabulary: [CONTEXT.md](./CONTEXT.md). Architecture: README beside the code you edit; index at [packages/core/README.md](./packages/core/README.md).

When behavior changes, update that folder's README and any parent index that lists it. Use CONTEXT.md terms consistently. User-facing public package changes also need a changeset (`pnpm changeset`); do not hand-edit package versions or `CHANGELOG.md` for release notes.

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
