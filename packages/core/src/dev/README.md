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

Dev transform requests retry when their source changes or is invalidated during compilation. Concurrent requests share one in-flight compile per source, including across source and global invalidation; stale attempts release their slot before retrying. Only results for the current source snapshot enter the module cache, so rapid edits cannot label stale browser code with a newer source hash.

Bare browser imports are prebundled to `/assets/vendors/<name>.<hash>.js` under the dist directory. The hash covers the specifier, the `version` in the installed package's root `package.json` (also for aliased installs such as `npm:react@19`), and the entry file. An upgrade therefore gets a new file and URL, while an existing file with the same name is reused, including after a restart. For a workspace-linked package, one whose real path is outside `node_modules` (such as a pnpm `workspace:` link), the hash also covers every file of the package except its `node_modules` and dot entries, because such a package changes without a version bump. Edits to it are not watched, so the edited code is bundled after the development server restarts. Every file under `/assets/vendors`, including integration runtime files whose names carry no hash (such as React's `react.development.js`), is served with `Cache-Control: no-cache` and a content `ETag`, so browsers revalidate it on each load and get `304` while it is unchanged.

## Additional watch paths

The Project Watcher resolves each `additionalWatchPaths` entry against the root directory. A plain path is watched as given and matches itself and everything inside it. An entry containing `*` is a glob: chokidar takes only literal paths, so the pattern is split at its first segment with a glob character. The static prefix, resolved against the root directory, is the base the watcher subscribes to (`content` for `content/**/*.md`, the root directory for `**/*.config.ts`), and the rest is matched with `path.matchesGlob` against paths relative to that base, so glob characters in the root directory path never reach the matcher. A path segment starting with `.` matches only a pattern segment starting with `.`, on Node and Bun alike. The watcher ignores files and dot-directories reached only through a glob base unless the glob can match them, and warns when a glob's base is the filesystem root. On Windows a pattern may separate segments with `\` or `/`.

The watcher never descends into `node_modules`, `.git`, the work directory or `distDir`. chokidar reports paths with `/` on every platform, so they are normalised before the check, which keeps these folders ignored on Windows.

## Process restarts

The Project Watcher classifies the resolved `eco.config` module and supported project dotenv paths separately from HMR. Under the CLI, those changes request a graceful runtime stop and a supervised child-process restart so config modules and environment values are loaded from scratch. When the restarted child exits with an error, the CLI supervisor waits for the next config or dotenv change and launches again instead of exiting. Embedded hosts are warned without core terminating their process. Runtime entry watchers own config-module changes when `dev:watch` is active, while the Project Watcher continues to own dotenv changes.
