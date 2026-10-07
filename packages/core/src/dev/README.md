Development-only browser tooling is opt-in per application.

## Dev toolbar

- `/_dev_toolbar.js` — browser bundle built by core from `devToolbar.package` (for example `@ecopages/dev-toolbar`)
- `#__ECO_DEV_MANIFEST__` — per-page dependency graph payload for the Deps panel
- Build errors — the reference toolbar claims HMR error presentation; custom clients use the [build error event contract](../dev-toolbar/README.md#build-error-presentation), with an in-page fallback for unclaimed errors

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

Bare browser imports are prebundled to `/assets/vendors/<name>.<hash>.js` under the dist directory. The hash covers the specifier, the installed package's version and entry file. For workspace-linked packages whose real path is outside `node_modules`, it also covers every file of the package except `node_modules` and dot entries. Existing bundles with the same name are reused across processes unless a watched workspace edit discards them before restarting. The fingerprint does not cover a linked package's dependencies, so changing only those dependencies and manually restarting can still reuse stale output. Every vendor file, including integration runtimes with unhashed names, is served with `Cache-Control: no-cache` and a content `ETag`; browsers revalidate on each load and receive `304` while the content is unchanged.

## Additional watch paths

The Project Watcher resolves each `additionalWatchPaths` entry against the root directory. A plain path is watched as given and matches itself and everything inside it. An entry containing `*` is a glob: chokidar takes only literal paths, so the pattern is split at its first segment with a glob character. The static prefix, resolved against the root directory, is the base the watcher subscribes to (`content` for `content/**/*.md`, the root directory for `**/*.config.ts`), and the rest is matched with `path.matchesGlob` against paths relative to that base, so glob characters in the root directory path never reach the matcher. A path segment starting with `.` matches only a pattern segment starting with `.`, on Node and Bun alike. The watcher ignores files and dot-directories reached only through a glob base unless the glob can match them, and warns when a glob's base is the filesystem root. On Windows a pattern may separate segments with `\` or `/`.

The watcher never descends into `node_modules`, `.git`, the work directory or `distDir`. chokidar reports paths with `/` on every platform, so they are normalised before the check, which keeps these folders ignored on Windows.

## Process restarts

The Project Watcher classifies the resolved `eco.config` module, the project files it imports (`absolutePaths.configModuleFiles`), and supported project dotenv paths separately from HMR. Under the CLI, those changes request a graceful runtime stop and a supervised child-process restart so config modules and environment values are loaded from scratch. When the restarted child exits with an error, the CLI supervisor waits for the next config, config-imported, or dotenv change and launches again instead of exiting. Embedded hosts are warned without core terminating their process. Runtime entry watchers own changes to `eco.config.ts` itself when `dev:watch` is active; the Project Watcher still owns dotenv files and files the config imports.

During `ecopages dev`, linked package roots resolved from the application's declared dependencies are also watched. Adding, editing, or deleting a file requests a supervised restart, reloading server imports and rebuilding browser vendors. Their `node_modules` and dot entries are skipped. Generated vendor output is discarded before this restart so an unchanged vendor cannot reuse bundled code from an edited linked dependency. This automatic invalidation applies to watched package events; a manual restart alone retains the dependency-fingerprint limitation described above. See [Project Watcher](../watchers/README.md) for discovery and host behavior.
