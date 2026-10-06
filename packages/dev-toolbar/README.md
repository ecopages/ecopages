# @ecopages/dev-toolbar

Development-only browser toolbar for Ecopages. Mounts during `ecopages dev` and does not ship to production builds.

User-facing docs: [Dev toolbar](https://ecopages.dev/docs/core/dev-toolbar) (enablement, manifest, built-in apps).

## Install

Add the package to your app and opt in from config:

```ts
import { defineConfig } from '@ecopages/core/config';
import { devToolbar } from '@ecopages/dev-toolbar/config';

export default defineConfig({ devToolbar: devToolbar() });
```

```bash
pnpm add -D @ecopages/dev-toolbar
```

During `ecopages dev`, core bundles your configured package to `/_dev_toolbar.js` and injects the dev manifest for the Deps panel. Restart the dev server after toolbar client changes.

`@ecopages/dev-toolbar` mirrors the core manifest contract locally for browser bundling (`src/api/manifest-contract.ts`); keep it in sync via `manifest-contract.test.ts`.

Disable per project with `devToolbar: { enabled: false }`, or per process with `ECOPAGES_DEV_TOOLBAR=false`.

## Built-in apps

- **Build errors** — opens automatically on HMR errors, reveals stealth mode, lists distinct messages as text, and shows an error count badge; any non-error HMR event clears messages and the badge
- **Navigation** — route timing archive, initial load, client navigation latency, HMR status, page Integration (route owner); writes `#__ECO_DEV_NAV_TELEMETRY__` in `document.head` (with `data-eco-persist`) and exposes `window.__ECO_DEV_NAV_TELEMETRY__` for machine/AI debug
- **Deps** — Page Browser Graph entry/chunk assets, vendor URLs, lazy-load hints
- **Islands** — inspect island hosts stamped with `data-eco-island`, including SSR-emitted React `<eco-island>` hosts; repeated component instances are shown independently and hydration status reports `hydrated` (via `data-eco-hydrated` or verified component update completion), `registered` (for defined custom elements awaiting update completion), or `ssr-only`
- **A11y** — axe-core audit (with built-in fallback checks) and in-page highlights
- **Settings** — dock placement (top, bottom, left, right), stealth mode, and documentation link

## Bring your own dev toolbar

Core delivers the configured client at `/_dev_toolbar.js` and injects `#__ECO_DEV_MANIFEST__` per page. Your package owns the dock UI and panels.

To replace this reference toolbar:

1. Create a client package that exports a browser bootstrap module (same layout as `@ecopages/dev-toolbar`).
2. Set `devToolbar.package` in `eco.config.ts` (use `defineDevTool` from `@ecopages/core/dev-toolbar/define-dev-tool` for BYO packages).
3. Fork or copy this package if you want Radiant panels, manifest readers, and stealth dock behavior.

`@ecopages/dev-toolbar` is the reference implementation.

Custom clients can claim the HMR runtime's cancelable `ecopages:build-error` window event (`detail: { message: string }`) with synchronous `preventDefault()` to suppress the in-page fallback. Listen for `ecopages:build-error-clear` to reset errors. After registering listeners, dispatch `ecopages:build-error-request` to replay active messages if mounting late. Core exports the names and payload type from `@ecopages/core/dev-toolbar/build-error-contract`; the reference client mirrors the event names locally for browser bundling. Unclaimed errors still use the fallback. Remove listeners when unmounting.

## Reference-toolbar internals

`window.__ECO_DEV_TOOLBAR_APPS__` is an optional registry used inside this package for experimental extra dock apps. It is **not** a supported Ecopages extension API — app authors should replace `devToolbar.package` instead.

## Package layout

- `src/bootstrap.ts` — injects toolbar CSS into `document.head`, boots navigation telemetry, and mounts `eco-dev-toolbar`; reload-safe telemetry ownership prevents HMR bundle re-evaluation from adding duplicate document listeners
- `src/runtime/navigation-events.ts` — shares the three navigation lifecycle listeners across toolbar apps and removes them when the final subscriber unmounts
- `src/shell/eco-dev-toolbar.tsx` — Radiant light-DOM host (JSX `render()`, no shadow root); panel positioning is pure CSS
- `src/shell/motion.ts` — WAAPI motion for stealth dock reveal only; panel show/hide is CSS
- `src/apps/*-panel.tsx` — Radiant JSX panels (navigation, deps, islands, a11y, settings)
- `src/api/manifest-contract.ts` — browser-local mirror of the core dev manifest contract
- `src/api/build-error-contract.ts` — browser-local event names checked against the public core build error contract
- `src/api/dev-manifest.ts` — internal DOM read/write for `#__ECO_DEV_MANIFEST__`
- `src/api/types.ts` — toolbar app host contracts
- `src/shell/` — custom element host, SVG icons, styles, and `ensureDevToolbarStyles()` (optional CSS override for BYO toolbars)
