# Copilot Coding Rules

## Commenting

- Avoid inline comments (`// ...`).
- Use JSDoc comments (`/** ... */`) only when necessary, especially for public APIs, complex logic, or exported functions/classes.
- Do not over-comment; prefer clear, self-explanatory code.

## Formatting

- Do not worry about style or formatting issues (e.g., Prettier, linter warnings).
- Auto-format on save will handle these.
- Template literals are preferred over string concatenation.
- Do not use emoji, symbols, or other non-standard characters. Instead you can use plain text (i.e. `[what-emoji-represent]`)

## TypeScript

- Avoid TypeScript hacks and anti-patterns.
- Do not use `any` unless absolutely necessary.
    - If you must use `any`, add a comment explaining why.
- Prefer `unknown` over `any` when possible.

## JS Runtime

- The project uses Node.js as the runtime and pnpm as the package manager.
- Use `node:` prefix for built-in module imports (e.g. `import fs from 'node:fs'`).
- Use `import.meta.dirname` / `import.meta.filename` instead of `__dirname` / `__filename` (ESM-safe).
- Do not use Bun-specific APIs (e.g. `Bun.write`, `Bun.file`).

## Changelog

- Every package has a `CHANGELOG.md`. Changelog tracking started at version `0.2.0`; prior history is in git.
- Any commit that touches a **public API, adds a feature, or fixes a bug** must include an entry in the relevant package's `CHANGELOG.md` under the current unreleased version block.
- Group entries under the appropriate heading: `### Features`, `### Refactoring`, `### Bug Fixes`, `### Tests`, or `### Documentation`.
- Do not use emoji or symbols in changelog entries (plain text only, per formatting rules above).
- Keep entries concise: one line per change, linking the commit hash in parentheses where useful.
- The active development block must always be headed `## [UNRELEASED] — TBD`. On release, replace `[UNRELEASED]` with the version number and `TBD` with the release date (YYYY-MM-DD).
- The release date on the version heading is updated on the actual release/merge commit, not during development.
