# Conventions

**Placement.** Follow the package: next to the source (`foo.test.ts` beside `foo.ts`) or in its test folder, whichever it already does. Do not introduce a new layout or file suffix; the test config may not include it.

**Imports.** Import the test API explicitly (`import { describe, expect, test } from 'vitest'`) unless the project enables globals. Match the assertion style of the file you are in.

**Names** describe the behaviour, short:

```ts
test('prefers the most specific catch-all when several match one request', ...)
test('drops excluded URLs and always keeps extra URLs', ...)
```

Not "should correctly return the expected result when given valid input." Group with `describe('unitName')` when there are several cases. Prefer a table (`test.for`, `test.each`) over copy-pasted blocks with the same assertion shape.

**Filesystem.** Use a real temp dir, not a mocked filesystem:

```ts
let rootDir: string;

beforeEach(() => {
	rootDir = mkdtempSync(path.join(tmpdir(), 'area-'));
});

afterEach(() => {
	rmSync(rootDir, { recursive: true, force: true });
});
```

Write the inputs, run the unit, read the output back. Never write into the source tree or a shared fixture.

**Shared setup.** Before hand-building a config object or a fake app, look for the project's test helpers and fixtures and use them. Do not add another fixture for one test file.

**Hygiene.** Assume nothing is restored for you. Pair each stub with its restore in `afterEach`: `vi.spyOn` with `vi.restoreAllMocks()`, `vi.stubEnv` with `vi.unstubAllEnvs()`, `vi.stubGlobal` with `vi.unstubAllGlobals()`. Never assign `process.env` directly: `process.env.X = undefined` stores the string `'undefined'`, and a write that leaks makes results depend on test order.
