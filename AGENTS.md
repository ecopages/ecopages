# Agent instructions

Coding standards for agents. Domain vocabulary: [CONTEXT.md](./CONTEXT.md). Architecture: README beside the code you edit; index at [packages/core/README.md](./packages/core/README.md).

When behavior changes, update that folder's README and any parent index that lists it. Use CONTEXT.md terms consistently. User-facing public package changes also need a changeset (`pnpm changeset`); do not hand-edit package versions or `CHANGELOG.md` for release notes. A changeset is `minor` at most, never `major` (the fixed version group would publish 1.0.0); a breaking change adds a `**Breaking:**` block with the migration.

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

- Fix the cause, not the symptom. Before 1.0, prefer a clean breaking change over an alias, fallback or compatibility path.
- Do not tag exports `@internal`; do not export what is not public.
- Filesystem access goes through `@ecopages/file-system`; extend it when a capability is missing.

## Verifying

- Before pushing, run `pnpm run test:vitest`, `pnpm run typecheck` and `pnpm run lint`, and stop on the first failure. Run the e2e projects your change can affect (CI runs `pnpm run test:e2e:pr`).
- A test for a fix must fail without the fix.
- Do not use `git stash` when several worktrees share a repository; the stash list is shared.
