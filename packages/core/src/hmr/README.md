# HMR Layer

This directory contains the framework-owned hot-update strategy contracts used by runtime adapters and integrations.

## Purpose

The HMR layer separates change classification from update execution.

It is responsible for:

- defining the shared HMR manager and strategy contracts
- letting integrations contribute framework-specific update strategies
- keeping adapter transports independent from update policy

## How It Fits

1. `ProjectWatcher` observes file changes.
2. `DevelopmentInvalidationService` classifies the change.
3. The active HMR manager selects a strategy.
4. The strategy coordinates browser rebuilds, metadata reloads, and client broadcasts.

## Design Rule

Generic invalidation policy belongs in core services.
Framework-specific update behavior belongs in HMR strategies.
Runtime-specific WebSocket or event-stream transport belongs in adapters.

## Registered entrypoints and dev transform

`SharedHmrManager` in `adapters/shared/hmr/` centralizes file-change handling via `handleFileChange()`. Server invalidation, integration hooks, rebuild, and client broadcast run in one sequence.

Dev client modules are served on demand through `DevTransformServer` (`src/dev/`). `DevTransformEntrypointRegistry` tracks registered entrypoints for HMR invalidation. Registration returns a stable dev-transform URL immediately; the first request (or cache miss) runs Rolldown on demand.

`BrowserBundleService` is the sole browser-plugin resolver for HMR builds. HMR managers route `hmr-runtime` and `hmr-entrypoint` rebuilds through the `browser-hmr` executor profile.

Hosts call `prepareHmrFileChange()` before HMR dispatch (`hmr/hmr-file-change-prep.ts`) so page browser graph sessions invalidate consistently with file changes.

## Client events

| Event           | Client behavior                                                                                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `update`        | Cache-bust and re-import the changed module URL (or reload the active page module)                                                                                                                                             |
| `css-update`    | Refresh matching stylesheet `link` hrefs                                                                                                                                                                                       |
| `layout-update` | Soft current-page reload with layout cache cleared (`persistLayouts` remounts the updated layout without a full document reload). Falls back to `location.reload()` only if no navigation owner handles it                     |
| `reload`        | Full `location.reload()`                                                                                                                                                                                                       |
| `error`         | Logs to the console and lists the message, once, in a fixed element appended to `<html>` (`client/build-error-overlay.ts`). Any other event removes it, as do Escape, its Dismiss button, and a click outside a text selection |

`error` events also report watcher and route errors. `SharedHmrManager` broadcasts one when the dev transform server fails to build a requested module, and sends pending ones to a socket that connects later; see [dev/README.md](../dev/README.md#build-errors-of-served-modules).

Other HMR events are not queued. While no browser is connected, `SharedHmrManager` drops a file change's events and logs that it did so at debug level. A tab opened later loads its page after the change, so its HTML and versioned module URLs are already current. A tab whose socket was reconnecting at the time keeps its old page until the next change; replaying a `reload` to cover it would also reload every freshly opened tab, because the server cannot tell the two apart.

Dev-transform local imports are rewritten with a content-hash query (`?v=…`) so transitive layout/component modules get a new ESM module-map key after invalidation. Soft `layout-update` then picks up the new layout while shared outer layout persistence still applies across normal SPA navigations.
