Development-only browser tooling is opt-in per application.

## Dev toolbar

- `/_dev_toolbar.js` — browser bundle built by core from `devToolbar.package` (for example `@ecopages/dev-toolbar`)
- `#__ECO_DEV_MANIFEST__` — per-page dependency graph payload for the Deps panel

Public docs: [Dev toolbar](/docs/core/dev-toolbar) (built-in apps, manifest fields).

Configure in `eco.config.ts`:

```ts
import { devToolbar } from '@ecopages/dev-toolbar/config';

.setDevToolbar(devToolbar())
```

For a custom client package, use `defineDevTool` from `@ecopages/core/dev-toolbar/define-dev-tool`.

Install the client package in the app project. Core resolves it from the application root and bundles it during watch mode.

Disable per project with `devToolbar: { enabled: false }`, or per process with `ECOPAGES_DEV_TOOLBAR=false`.

Server wiring: [dev-toolbar/README.md](../dev-toolbar/README.md) (`DevToolbarHost`, manifest, runtime bundling, HTML injection). Bring-your-own toolbars export `src/bootstrap.ts` and use the same `devToolbar.package` config key.

Dev transform requests retry when their source changes or is invalidated during compilation. Concurrent requests share one in-flight compile per source, including across source and global invalidation; stale attempts release their slot before retrying. Only results for the current source snapshot enter the module cache, so rapid edits cannot label stale browser code with a newer source hash.
