# @ecopages/testing

Private workspace-only testing primitives for Ecopages packages, playgrounds, and fixture apps.

This package is intentionally internal. It exists to centralize stable test contracts and repeated setup without forcing unrelated test suites into one abstraction too early.

## Scope

Use this package for shared testing infrastructure that has already proven stable across multiple packages.

Current responsibilities:

- `createTestAppConfig()` for the common Ecopages app-config test baseline.
- `createStringMarkupIntegration()` for plain TypeScript fixture templates that return trusted HTML strings.
- `createDeferredIntegrationPlugin()` for shared foreign-renderer contract fixtures.
- Shared kitchen-sink shell components that are portable across package boundaries.

## Migration Rules

Use `createTestAppConfig()` when a test needs the normal Ecopages app-config baseline and only varies a few config fields.

Prefer the helper for:

- integration renderer tests
- plugin tests outside `@ecopages/core`
- shared fixture apps and playground routes
- tests that would otherwise repeat the same `robotsTxt`, metadata, base URL, and integration initialization sequence

Call `finalizeEcoPagesConfig()` from `@ecopages/core/internal/finalize-config` directly when the test validates finalization itself, or when the helper's defaults would hide the behavior under test. Most `packages/core` tests that assert config semantics do this.

## Helper Shape

`createTestAppConfig()` is intentionally small.

Default behavior:

- base URL: `http://localhost:3000`
- default metadata title/description: `Ecopages`
- robots preferences: empty allow/disallow baseline
- integrations: a test-only `string` Integration that owns `.string.ts` templates, configured on the final app config and initialized with a runtime origin

Supported overrides:

- `baseUrl`: changes the final app config URL
- `runtimeOrigin`: changes the runtime origin used to initialize integrations when it should differ from `baseUrl`
- `distDir`: sets a custom dist dir for tests that need isolated outputs
- `title` and `description`: override default metadata
- `integrations`: replaces the default Integration list and initializes the supplied plugins; pass `[]` to register none of your own (core still appends its HTML Pages Integration)
- `rootDir` / `workDir`: project paths on the user config (same fields as `defineConfig`); omitted `rootDir` resolves from the current working directory
- `configure(userConfig)`: narrow escape hatch to adjust the user config before finalization

Example:

```ts
import { createTestAppConfig } from '@ecopages/testing';

const config = await createTestAppConfig({
	distDir: testDir,
	runtimeOrigin: 'http://127.0.0.1:4100',
	workDir: '.eco-parallel',
	integrations: [plugin],
});

// Or boot the full app adapter (same config path as createApp()):
const app = await createTestApp({ workDir: '.eco-parallel', integrations: [plugin] });
await app.start();
```

## String markup fixtures

Use `createStringMarkupIntegration()` only when a test fixture needs TypeScript templates that return HTML strings. The default owns `.string.ts` files. Fixture apps that keep plain `.ts` templates must pass `extensions: ['.ts']`. It uses `StringMarkupRenderer`; markup is trusted and interpolation is not escaped.

```ts
import { createStringMarkupIntegration, createTestAppConfig } from '@ecopages/testing';

const config = await createTestAppConfig({
	integrations: [createStringMarkupIntegration({ extensions: ['.fixture.ts'] })],
});
```

This is test infrastructure, not an application rendering default. Production applications must register an Integration that owns their route file extensions.

## Design Constraints

Do not turn this package into a generic dump of helpers.

Before extracting a new helper, verify that:

- the same pattern exists in multiple packages
- the behavior is contract-level, not tied to one framework's implementation details
- the abstraction removes repetition without hiding the thing the test is supposed to prove

Current known boundary:

- shared kitchen-sink shells should stay contract-focused and portable; if a shell starts depending on app-local helpers or repo-internal aliases, keep it local until that dependency is made explicit and shareable
