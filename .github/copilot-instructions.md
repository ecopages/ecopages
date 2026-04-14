# Copilot Coding Rules

## Code Style

- Avoid inline comments (`// ...`). Use TSDoc only for public APIs or complex logic.
- Do not worry about formatting; auto-format on save handles it.
- Template literals over string concatenation.
- No emoji or symbols; use plain text (i.e. `[what-emoji-represent]`).

## TypeScript

- No `any` unless absolutely necessary (add a comment explaining why). Prefer `unknown`.
- Trust inherited types: do not add runtime validation for values already enforced by TypeScript interfaces.
- Avoid defensive programming against typed interfaces; unnecessary guards add noise and cognitive load.
- Prefer modern APIs over manual equivalents (e.g. `new Headers(entries)` over iterating and appending).

## Documentation Voice

- Customer-facing docs must describe the product contract, not comment on the authoring process or speak to the maintainer about how an example was written.
- Prefer neutral instructional or factual language such as `To enable...`, `Use...`, and ``X` requires...`.
- Avoid reviewer-style phrasing such as `Remember to`, `Don't forget`, `If your example...`, `future you`, or design-debt commentary unless the limitation is directly user-visible and actionable.

## Changelog

- Every package has a `CHANGELOG.md`. Tracking started at `0.2.0`; prior history is in git.
- Any commit touching a **public API, feature, or bug fix** must add an entry under the current `## [UNRELEASED] -- TBD` block.
- Group under: `### Features`, `### Refactoring`, `### Bug Fixes`, `### Tests`, or `### Documentation`.
- One concise line per change, plain text only, commit hash in parentheses where useful.
- On release, replace `[UNRELEASED]` with the version and `TBD` with the date (YYYY-MM-DD).
- Changelog entries must reflect the **final state** compared to the target branch (default: `main`). Do not keep iteration history -- if a feature was added and then reworked during the same branch, the entry should describe only the final result.
