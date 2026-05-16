# @ecopages/testing

Private workspace-only testing primitives for Ecopages packages, playgrounds, and fixture apps.

This package is intentionally internal. It exists to centralize stable test contracts and repeated setup without forcing unrelated test suites into one abstraction too early.

## Scope

Use this package for shared testing infrastructure that has already proven stable across multiple packages.

Current responsibilities:

- `createTestAppConfig()` for the common Ecopages app-config test baseline.
- `createDeferredIntegrationPlugin()` for shared foreign-renderer contract fixtures.
- Shared kitchen-sink shell components that are portable across package boundaries.

## Migration Rules

Use `createTestAppConfig()` when a test needs the normal Ecopages app-config baseline and only varies a small number of builder settings.

Prefer the helper for:

- integration renderer tests
- plugin tests outside `@ecopages/core`
- shared fixture apps and playground routes
- tests that would otherwise repeat the same `robotsTxt`, metadata, base URL, and integration initialization sequence

Prefer raw `ConfigBuilder` when the test is validating config-builder behavior itself or intentionally exercises low-level config finalization details.

Keep raw `ConfigBuilder` in:

- `packages/core` tests that assert config semantics directly
- tests where the order of builder calls is itself under test
- cases where a helper would hide the behavior being verified

## Helper Shape

`createTestAppConfig()` is intentionally small.

Default behavior:

- base URL: `http://localhost:3000`
- default metadata title/description: `Ecopages`
- robots preferences: empty allow/disallow baseline
- integrations: configured on the final app config and initialized with a runtime origin

Supported overrides:

- `baseUrl`: changes the final app config URL
- `runtimeOrigin`: changes the runtime origin used to initialize integrations when it should differ from `baseUrl`
- `distDir`: sets a custom dist dir for tests that need isolated outputs
- `title` and `description`: override default metadata
- `integrations`: installs and initializes integration plugins
- `configure(builder)`: narrow escape hatch for one-off builder customization such as `rootDir`, `workDir`, or additional watch paths

Example:

```ts
const config = await createTestAppConfig({
	distDir: testDir,
	runtimeOrigin: 'http://127.0.0.1:4100',
	configure: (builder) => builder.setWorkDir('.eco-parallel'),
	integrations: [plugin],
});
```

## Design Constraints

Do not turn this package into a generic dump of helpers.

Before extracting a new helper, verify that:

- the same pattern exists in multiple packages
- the behavior is contract-level, not tied to one framework's implementation details
- the abstraction removes repetition without hiding the thing the test is supposed to prove

Current known boundary:

- shared kitchen-sink shells should stay contract-focused and portable; if a shell starts depending on app-local helpers or repo-internal aliases, keep it local until that dependency is made explicit and shareable