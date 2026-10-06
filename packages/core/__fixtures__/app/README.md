# Core integration fixture app

Minimal Ecopages project used by unit tests and `test-server.ts`.

## Config

- `eco.config.ts` — `defineConfig(createFixtureUserConfig())` (author-facing default).
- `fixture-user-config.ts` — shared user config for `eco.config.ts` and tests.
- `copy-fixture-app.ts` — `copyFixtureApp()` for tests that write to the app (see below).

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

Tests that edit sources or write build output (including anything under `.eco` or `dist`) run against a copy of this folder and pass the copy as `rootDir`. Parallel suites read this folder, so do not edit or build it in place.

```ts
import { copyFixtureApp } from './copy-fixture-app.ts';

const appDir = copyFixtureApp(); // temp copy, `node_modules` linked
try {
	const appConfig = await createFixtureAppConfig({ rootDir: appDir });
} finally {
	rmSync(appDir, { recursive: true, force: true });
}
```

`copy-fixture-app.ts` imports only Node built-ins, so suites in other packages (such as `@ecopages/react`) import it by relative path.

`app.ts` uses `createApp()` with no arguments so CLI and e2e exercise the real config module path.
