# Dev toolbar (core)

Server-side wiring for the development-only in-browser inspector. Public docs: [Dev toolbar](/docs/core/dev-toolbar).

## Boundaries

| Layer                                     | Owns                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Core** (`DevToolbarHost`)               | Enablement, `/_dev_toolbar.js` delivery, per-route `#__ECO_DEV_MANIFEST__`, HTML script injection |
| **Client package** (`devToolbar.package`) | Dock UI, panels, and any extra apps                                                               |
| **Integrations**                          | Page rendering and browser assets — not toolbar dock apps                                         |

`@ecopages/dev-toolbar` is an optional peer. Core does not import it at runtime unless `devToolbar.package` is configured. The dev manifest contract (`dev-toolbar-manifest-contract.ts`) lives in core so apps and custom toolbar clients can type the payload without installing the reference toolbar package.

## Module map

| File                               | Role                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev-toolbar-host.ts`              | Enablement, manifest contribution, runtime bundling, HTML injection                                                                                                         |
| `dev-toolbar-manifest-contract.ts` | `#__ECO_DEV_MANIFEST__` id and payload types (public: `@ecopages/core/dev-toolbar/dev-toolbar-manifest-contract`; mirrored in `@ecopages/dev-toolbar` for browser bundling) |
| `dev-toolbar-manifest.ts`          | Builds and serializes the per-page dev manifest                                                                                                                             |
| `dev-toolbar-package.ts`           | Resolves `devToolbar.package` bootstrap entry (`bootstrap.js`, then `.ts`)                                                                                                  |
| `dev-toolbar-config.ts`            | `isDevToolbarEnabled` — watch mode, env var, package required                                                                                                               |
| `dev-toolbar-html-response.ts`     | Adapter helpers for injecting `import '/_dev_toolbar.js'`                                                                                                                   |
| `dev-toolbar-runtime-paths.ts`     | `/_dev_toolbar.js` URL and work-dir paths                                                                                                                                   |
| `define-dev-tool.ts`               | Config helper for bring-your-own client packages                                                                                                                            |
| `build-error-contract.ts`          | Public error, clear, and replay event names and error payload type for custom clients                                                                                       |

## Build error presentation

`@ecopages/core/dev-toolbar/build-error-contract` exports the window event names and `BuildErrorDetail` (`{ message: string }`). Custom clients listen for cancelable `ecopages:build-error` events and call `preventDefault()` synchronously only when they present the message. Unclaimed errors use the HMR runtime's in-page fallback, including when the toolbar is disabled or has not mounted.

Listen for `ecopages:build-error-clear` to reset messages and badges on any non-error HMR event. Register both listeners before dispatching `ecopages:build-error-request`: it synchronously replays active messages and rebuilds the fallback only for unclaimed messages. Remove listeners when the client unmounts. Messages may repeat; clients should deduplicate by message. Error text includes watcher and route failures as well as module compilation failures.

The reference toolbar opens its Build errors app automatically, reveals stealth mode, and displays a count badge. Closing the panel keeps errors available until the next HMR update. The HMR runtime retains active messages for replay independently of fallback dismissal.

## Injection sequence

1. Route HTML is finalized with `#__ECO_DEV_MANIFEST__` appended to `<body>` (`route-html-finalization.service.ts`).
2. The server adapter injects `import '/_dev_toolbar.js'` before `</html>` when the toolbar is enabled (`server-adapter.ts` → `DevToolbarHost.injectHtmlResponse`).
3. HMR manager copies or bundles the configured client package to `/_dev_toolbar.js` during watch mode (`shared-hmr-manager.ts`).

## Config

```ts
import { defineConfig } from '@ecopages/core/config';
import { devToolbar } from '@ecopages/dev-toolbar/config';

export default defineConfig({ devToolbar: devToolbar() });
```

Bring-your-own client:

```ts
import { defineConfig } from '@ecopages/core/config';
import { defineDevTool } from '@ecopages/core/dev-toolbar/define-dev-tool';

export default defineConfig({ devToolbar: defineDevTool('@acme/my-dev-toolbar') });
```

Disable per project with `devToolbar: { enabled: false }`, or per process with `ECOPAGES_DEV_TOOLBAR=false`.

Parent index: [dev/README.md](../dev/README.md).
