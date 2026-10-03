---
name: testing
description: Use when writing, generating or reviewing automated tests, choosing which layer a test belongs in (unit, DOM, runtime-specific, end-to-end, benchmark), or rejecting a test that cannot fail. Includes Vitest and Playwright notes.
---

# Testing

A test exists to catch a behaviour change someone would care about. A test that cannot fail unless the test file itself changes is waste. Prefer a few tests that pin a contract over a suite that restates the implementation.

**Project specifics** (test layers, commands, where files go, shared fixtures) come from the project's `AGENTS.md` and the project skill it names, then from the test config. Match the nearest existing test in the same package, and use the project's domain terms.

## Load what the task needs

| Task | Read |
|------|------|
| Writing any test: placement, naming, files on disk, stub hygiene | [references/conventions.md](references/conventions.md) |
| A cache, incremental build or invalidation path | [references/cache-and-invalidation.md](references/cache-and-invalidation.md) |
| A test that needs a real DOM | [references/browser.md](references/browser.md) |
| A Playwright spec or fixture | [references/e2e.md](references/e2e.md) |

## Choose a layer

Stop at the first layer that can fail for the bug you care about:

1. **Unit:** pure decisions and mappings, in process, no DOM.
2. **DOM:** code that owns the DOM, such as navigation, hydration or custom elements.
3. **Runtime-specific:** what only one runtime provides. Test the logic under the default runtime with the runtime injected or stubbed; use the real one only when the assertion needs it.
4. **End-to-end:** the wired system, such as a dev server, real navigation, HTTP headers or build output.
5. **Benchmark:** cost, not correctness. Back a performance claim with a before-and-after run of the project's benchmark. Never assert wall-clock time in a test.

Check what runs the test. A file outside every include glob of the test config never runs, and green CI then proves nothing.

## What to test

Test a **decision** or a **boundary**:

- Input that must be rejected or left out: a missing required config field, a page whose metadata throws, a request no route matches
- Input that used to take the wrong branch: the most specific of several matching routes wins
- A mapping that would silently drift: a cache strategy to its `cache-control` header, a file extension to its handler
- Order independence: a result must not depend on glob order or on which test ran first
- Failure the user would see: an error page instead of a 404, a page missing from the output, stale HTML after an edit

Do **not** test:

- That a constant equals itself
- That something you just built is `toBeDefined()` or `toBeTruthy()`
- That a mock was called, unless the call **is** the contract (then assert its arguments)
- A restatement of the implementation, or your own test double
- Private members reached with a cast. If a behaviour is not observable through the public surface, the seam is wrong
- Snapshot dumps of whole objects "to have something"

Litmus: if someone rewrote the internals and the user-visible result stayed the same, would this test fail? If yes, it is coupled to the implementation. Rewrite it against the result.

One non-trivial branch, loop, parser or trust boundary needs **one** test that fails if that logic breaks. Do not add a `describe` per function for coverage.

**Test-only API is dead API.** Do not add an exported setter, a getter, a counter or a flag that exposes internal state so a test can reach in. If only a test calls a symbol, delete both. A parameter that replaces a process boundary (a clock, a runtime, a filesystem) is a seam, not test-only API.

**A test can pin a bug.** When a test contradicts the documented contract, fix the test and say so in the PR. Never bend correct code to keep a test green.

## Tautology (reject these)

```ts
// a constant equals itself
expect(Priority.HIGH).toBe(100);

// asserts nothing
expect(watcher).toBeDefined();

// reimplements the unit: the test sorts, the code under test never runs
const sorted = [...handlers].sort((a, b) => b.priority - a.priority);
expect(sorted[0].name).toBe('integration');

// mock theatre
expect(fileSystem.write).toHaveBeenCalled();
```

Rewrite until the assertion names a **value, error or visible state** the production code could get wrong:

```ts
expect(sitemapUrls).toEqual(['https://example.com/', 'https://example.com/about']);
expect(response.headers.get('cache-control')).toBe('no-store, must-revalidate');
expect(readFileSync(path.join(outDir, 'index.html'), 'utf8')).toContain('<h1>Home</h1>');
```

For priority logic, give the code two handlers that both match one input and assert which one handled it.

## Mocks

Default: do not mock. Feed data in, read data out.

Mock at a **process boundary**: the network, the clock, a runtime global, a child process, the environment. The filesystem is usually not one; use a temp dir. Spy on it only to force what a real disk will not give on demand, such as an ordering or a failed write. Assert what crossed the boundary (URL, method, body, the path and content written), not how often an internal helper ran.

If a new test mocks every collaborator, delete the mocks and test the pure core instead.

## Generated tests

Treat tests an agent wrote, your own included, as a draft:

1. Run them at once, one file in run mode, and fix import and API errors.
2. Throw out tautologies, mock-only assertions, APIs from another framework (`jest.*` in a Vitest project), casts into private members, and direct `process.env` writes.
3. Look for the edge cases: empty input, a missing required field, a render that throws, every runtime the code supports. Add them, or delete a happy-path-only file.

When you delegate tests to a subagent, list the cases to cover, not "write tests for this file".

## Running

Always use run mode (`vitest run`, `playwright test`). Watch mode never exits and hangs the agent.
