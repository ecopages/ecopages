# Branch Audit: feature/vite-nitro

Date: 2026-04-11
Base: main

Status: The changelog and documentation accuracy issues called out in this audit have been addressed in the current working tree. The remaining weak points are the coverage and hardening follow-ups listed below.

## Scope

This audit reviewed the current branch against `main` with emphasis on the runtime-facing changes in core, the new Vite plugin package, browser-router behavior, CLI launch behavior, package metadata, and changelog accuracy.

## Checks Run

- `git log main..HEAD --oneline`
- `git diff --name-status main`
- `pnpm run release:check:versions`
- `pnpm run test:vitest`

## Result

Runtime health looks good overall.

- The repo release-version check passed.
- The Vitest suite passed: 120 files, 1126 tests.
- I did not find a confirmed runtime regression in the Node or Vite-host paths from the checks above.

The branch is not fully ready to merge as-is because the remaining weak points still need targeted hardening and coverage work.

## Findings

### Resolved: core changelog overstated the `createApp()` runtime behavior

The entry in [packages/core/CHANGELOG.md](/Users/andeeplus/github/ecopages/packages/core/CHANGELOG.md) says the internal Node fallback was removed and that direct core execution is Bun-only. That is not what the implementation does.

The runtime selector in [packages/core/src/adapters/create-app.ts](/Users/andeeplus/github/ecopages/packages/core/src/adapters/create-app.ts) still checks for `globalThis.Bun` and falls back to `./node/create-app.ts` when Bun is unavailable.

Impact:

- Release notes are misleading for users evaluating runtime support.
- Future refactors may treat Node fallback as removed even though it remains active code.

Status:

- Fixed in the working tree.

### Resolved: CLI changelog said Bun was now the default, but the CLI still falls back to Node

The entry in [packages/ecopages/CHANGELOG.md](/Users/andeeplus/github/ecopages/packages/ecopages/CHANGELOG.md) says `ecopages` now defaults to Bun launches.

The runtime chooser in [packages/ecopages/bin/launch-plan.js](/Users/andeeplus/github/ecopages/packages/ecopages/bin/launch-plan.js) prefers Bun when explicitly requested, when the package manager user agent is Bun, or when `Bun` exists globally, but otherwise returns `node`.

Impact:

- The changelog implies a behavior change stronger than the implementation.
- Users may infer Node fallback was removed from the CLI path when it was not.

Status:

- Fixed in the working tree.

### Resolved: file-system docs described the removed `fast-glob` path

The docs page [apps/docs/src/pages/docs/ecosystem/file-system.mdx](/Users/andeeplus/github/ecopages/apps/docs/src/pages/docs/ecosystem/file-system.mdx) still says the Node adapter uses `fast-glob`.

The actual Node adapter in [packages/file-system/src/adapters/node.ts](/Users/andeeplus/github/ecopages/packages/file-system/src/adapters/node.ts) now uses `node:fs/promises.glob()`.

Impact:

- Public docs are out of sync with published package behavior.
- The current file-system changelog is correct, but the docs contradict it.

Status:

- Fixed in the working tree.

## Weak Points

These are not confirmed merge blockers, but they are the weakest areas in the branch.

### Vite bridge coverage is still narrow

The new Vite dev-server bridge has tests for HTML normalization and stale header removal, but it still lacks focused coverage for:

- non-HTML passthrough behavior
- redirect responses
- duplicate Vite client injection protection
- request routing around Vite internals and direct asset requests

The implementation in [packages/vite-plugin/src/ecopages-dev-server.ts](/Users/andeeplus/github/ecopages/packages/vite-plugin/src/ecopages-dev-server.ts) and [packages/vite-plugin/src/html-transforms.ts](/Users/andeeplus/github/ecopages/packages/vite-plugin/src/html-transforms.ts) is plausible, but the edge-case coverage is thinner than the architectural importance of the feature.

### Browser-router regression coverage is broad but concentrated

The browser-router suite passed and includes substantial coverage in [packages/browser-router/test/eco-router.test.browser.ts](/Users/andeeplus/github/ecopages/packages/browser-router/test/eco-router.test.browser.ts), but many behaviors are still concentrated in one large browser test file.

That makes regressions harder to localize when document syncing, head swapping, or navigation handoff logic changes again.

### Changelog discipline is lagging behind the refactor pace

The branch history shows repeated refactors before the current shape stabilized. The result is that some changelog lines describe intermediate intent rather than the final branch behavior.

This is a process weakness more than a code weakness, but it matters because the repo explicitly treats changelogs as release-facing artifacts.

## Improvement Plan

1. Add Vite bridge tests for non-HTML passthrough, redirects, and duplicate client-script injection.
2. Split browser-router regression coverage into smaller service-level tests around DOM swapping and document-element synchronization.
3. Add a lightweight review step before release that compares changelog claims against the final implementation rather than the earlier refactor milestones.

## Verdict

Needs changes.

Reason:

- The branch looks functionally healthy from the checks I ran.
- The remaining issues are hardening and maintainability issues, not a confirmed runtime failure.
- The changelog and documentation accuracy issues identified above have already been corrected in the working tree.
