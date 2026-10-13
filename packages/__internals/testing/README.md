# @ecopages/testing

Private workspace-only testing primitives for Ecopages packages, playgrounds, and fixture apps.

This package is intentionally internal. It exists to centralize stable test contracts and repeated setup without forcing unrelated test suites into one abstraction too early.

## Scope

Use this package for shared testing infrastructure that has already proven stable across multiple packages.

Current responsibilities:

- `createTestAppConfig()` for the common Ecopages app-config test baseline.
- `createStringMarkupIntegration()` for plain TypeScript fixture templates that return trusted HTML strings.
- `createDeferredIntegrationPlugin()` for shared foreign-renderer contract fixtures.
- `describeRendererContract()` (from `@ecopages/testing/renderer-contract`) for the behaviour every Integration renderer owes core.
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

## Renderer contract

`describeRendererContract(harness)` registers the rows every Integration renderer must pass. Call it once from each Integration's renderer test file. It lives behind its own entry point because it imports `vitest`; the package root stays safe to import from config files.

Rows:

- a component renders as structured output with the Integration's name and root tag
- the foreign subtree payload of a plain component (empty assets, no root attributes, `first-element` attachment)
- the assets a component declares are returned
- island host attributes are stamped when the instance has client scripts
- a foreign boundary resolves, bubbles its assets and leaves the script-less shell unstamped
- a deferred foreign layout leaves no `<eco-marker` behind, and the explicit view equals the filesystem page, head included
- a view that throws fails with the Integration's error prefix and the cause

The harness supplies `name`, `errorPrefix`, `createRenderer({ integrations, processDependencies })`, `makeComponent(spec)` and `makeView(spec)`. The renderer's document shell must print `metadata.title` in `<head>`. Optional `viewFile` sets the file key and `renderIsland()` wraps island renders for an Integration that receives island assets through the render context (React). `createStringMarkupContractFactories(name)` builds `makeComponent` and `makeView` for Integrations whose components return HTML strings (kitajs, mdx, lit).

Core owns status, headers, partial views and the shared island and foreign-subtree plumbing against a test renderer (`integration-renderer.test.ts`). Keep framework-specific cases in the Integration's own tests; do not repeat a contract row there.

## Design Constraints

Do not turn this package into a generic dump of helpers.

Before extracting a new helper, verify that:

- the same pattern exists in multiple packages
- the behavior is contract-level, not tied to one framework's implementation details
- the abstraction removes repetition without hiding the thing the test is supposed to prove

Current known boundary:

- shared kitchen-sink shells should stay contract-focused and portable; if a shell starts depending on app-local helpers or repo-internal aliases, keep it local until that dependency is made explicit and shareable
