---
name: ecopages
description: Map of where the Ecopages repository keeps the facts the generic contributor skills need (checks, CI, test setup, e2e, benchmarks, commits, releases, issue schema, domain terms). Use with final-review, testing, github-cli, architecture-review or commit-expert when working in this repository, or to find which file is the source of truth for a command or convention here.
metadata:
  scope: project
---

# Ecopages

A map, not a rulebook. Each row names the file that holds the truth; read it there before acting. When a file and a skill disagree, the file wins: follow it and report the drift. Nothing here, and nothing remembered from an earlier session, replaces reading the source.

| Need | Source of truth |
|------|-----------------|
| Domain terms | [CONTEXT.md](../../../CONTEXT.md) |
| Coding, comment, issue and PR policy; the integration branch; milestones | [AGENTS.md](../../../AGENTS.md) |
| How an area works | The `README.md` beside the code; the index is [packages/core/README.md](../../../packages/core/README.md) |
| Checks before a commit | `test:pre-commit` in [package.json](../../../package.json), and the hook in [.husky/pre-commit](../../../.husky/pre-commit) |
| Checks before a PR | `test:all` in [package.json](../../../package.json) |
| What CI runs | [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) and the scripts it calls |
| Test projects and the files each one runs | [vitest.config.ts](../../../vitest.config.ts), [vitest.browser.config.ts](../../../vitest.browser.config.ts), [scripts/vitest-optional-includes.ts](../../../scripts/vitest-optional-includes.ts) |
| Shared test helpers and fixtures | [packages/\_\_internals/testing/README.md](../../../packages/__internals/testing/README.md) |
| E2E fixtures, projects and run scripts | [e2e/README.md](../../../e2e/README.md) |
| Benchmarks | [playground/kitchen-sink/bench/README.md](../../../playground/kitchen-sink/bench/README.md) |
| Template and skill-pack drift checks | [scripts/README.md](../../../scripts/README.md) |
| Commit types, scopes and title length | [.better-commits.json](../../../.better-commits.json) |
| Changesets, branches, merging and releases | [.changeset/README.md](../../../.changeset/README.md) |
| Issue forms, labels and the PR template | [.github/](../../../.github/) |
| The issue script | `pnpm issue` in [package.json](../../../package.json) |
