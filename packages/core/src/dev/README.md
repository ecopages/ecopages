Development-only browser tooling is opt-in per application.

## Dev toolbar

- `/_dev_toolbar.js` — browser bundle built by core from `devToolbar.package` (for example `@ecopages/dev-toolbar`)
- `#__ECO_DEV_MANIFEST__` — per-page dependency graph payload for the Deps panel

Public docs: [Dev toolbar](/docs/core/dev-toolbar) (built-in apps, manifest fields).

Configure in `eco.config.ts`:

```ts
import { defineConfig } from '@ecopages/core/config';
import { devToolbar } from '@ecopages/dev-toolbar/config';

export default defineConfig({ devToolbar: devToolbar() });
```

For a custom client package, use `defineDevTool` from `@ecopages/core/dev-toolbar/define-dev-tool`.

Install the client package in the app project. Core resolves it from the application root and bundles it during watch mode.

Disable per project with `devToolbar: { enabled: false }`, or per process with `ECOPAGES_DEV_TOOLBAR=false`.

Server wiring: [dev-toolbar/README.md](../dev-toolbar/README.md) (`DevToolbarHost`, manifest, runtime bundling, HTML injection). Bring-your-own toolbars export `src/bootstrap.ts` and use the same `devToolbar.package` config key.

Dev transform requests retry when their source changes or is invalidated during compilation. Concurrent requests share one in-flight compile per source, including across source and global invalidation; stale attempts release their slot before retrying. Only results for the current source snapshot enter the module cache, so rapid edits cannot label stale browser code with a newer source hash. A failed compile of a snapshot that changed in the meantime is retried the same way, so it is neither returned nor reported.

### Build errors of served modules

When a module fails to compile, `DevTransformServer` answers 500 with the error text, records the message under the module, and calls `onTransformError` with it. `SharedHmrManager` broadcasts that message as an HMR `error` event, which the HMR client shows in the page ([hmr/README.md](../hmr/README.md#client-events)).

- The failure is recorded under the requested module, but its cause can be another file and the module can be removed, so `SharedHmrManager.handleFileChange()` clears every recorded failure. A module that still fails records its error again on its next request. A successful request also removes its module's failure.
- The module request of a fresh page load can arrive before the page's HMR socket connects, and the broadcast then reaches no one. The Bun and Node adapters therefore call `sendPendingBuildErrors()` right after subscribing a socket, which sends one `error` event per recorded failure.

## Process restarts

The Project Watcher classifies the resolved `eco.config` module and supported project dotenv paths separately from HMR. Under the CLI, those changes request a graceful runtime stop and a supervised child-process restart so config modules and environment values are loaded from scratch. Embedded hosts are warned without core terminating their process. Runtime entry watchers own config-module changes when `dev:watch` is active, while the Project Watcher continues to own dotenv changes.
