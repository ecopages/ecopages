# Core integration fixture app

Minimal Ecopages project used by unit tests and `test-server.ts`.

## Config

- `eco.config.ts` — `defineConfig(createFixtureUserConfig())` (author-facing default).
- `fixture-user-config.ts` — shared user config for `eco.config.ts` and tests.

## Tests

```ts
import { createFixtureAppConfig, createFixtureApp } from './test-app-config.ts';

const appConfig = await createFixtureAppConfig();
// Or create test app directly:
const app = await createFixtureApp();

// Loader parity with on-disk eco.config.ts:
await createFixtureAppConfig({ configFile: 'eco.config.ts' });

// Rooted at a copy of this folder:
await createFixtureAppConfig({ rootDir: copyDir });

// Full adapter with custom options:
const fixtureApp = await createFixtureApp({ serverOptions: { port: 3002 } });
await fixtureApp.start();
```

Tests that edit sources or write build output run against a copy of this folder in a temp directory, with `node_modules` linked, and pass the copy as `rootDir`. Parallel suites read this folder, so do not edit it in place.

`app.ts` uses `createApp()` with no arguments so CLI and e2e exercise the real config module path.
