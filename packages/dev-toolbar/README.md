# @ecopages/dev-toolbar

Development-only browser toolbar for Ecopages, inspired by [Astro's dev toolbar](https://docs.astro.build/en/guides/dev-toolbar/).

User-facing docs: [Dev toolbar](https://ecopages.dev/docs/core/dev-toolbar) (enablement, manifest, built-in apps).

## Install

Add the package to your app and opt in from config:

```ts
import { ConfigBuilder } from '@ecopages/core/config-builder';
import { devToolbar } from '@ecopages/dev-toolbar/config';

export default new ConfigBuilder()
	.setRootDir(import.meta.dirname)
	.setDevToolbar(devToolbar())
	.build();
```

```bash
pnpm add -D @ecopages/dev-toolbar
```

During `ecopages dev`, core bundles your configured package to `/_dev_toolbar.js` and injects the dev manifest for the Deps panel. Restart the dev server after toolbar client changes.

Disable per project with `devToolbar: { enabled: false }`, or per process with `ECOPAGES_DEV_TOOLBAR=false`.

## Built-in apps

- **Navigation** — route timing archive, initial load, client navigation latency, HMR status, page Integration (route owner); writes `#__ECO_DEV_NAV_TELEMETRY__` for machine/AI debug
- **Deps** — Page Browser Graph entry/chunk assets, vendor URLs, lazy-load hints
- **Islands** — inspect island hosts stamped with `data-eco-island` (plus legacy React `eco-island` roots); click a row to highlight the live DOM node
- **A11y** — axe-core audit (with built-in fallback checks) and in-page highlights
- **Settings** — dock placement (top, bottom, left, right), stealth mode, and documentation link

## Bring your own dev toolbar

Core delivers the configured client at `/_dev_toolbar.js` and injects `#__ECO_DEV_MANIFEST__` per page. Your package owns the dock UI and panels.

To replace this reference toolbar:

1. Create a client package that exports a browser bootstrap module (same layout as `@ecopages/dev-toolbar`).
2. Set `devToolbar.package` in `eco.config.ts` (use `defineDevTool` from `@ecopages/core/dev-toolbar/define-dev-tool` for BYO packages).
3. Fork or copy this package if you want Radiant panels, manifest readers, and stealth dock behavior.

`@ecopages/dev-toolbar` is the reference implementation.

## Reference-toolbar internals

`window.__ECO_DEV_TOOLBAR_APPS__` is an optional registry used inside this package for experimental extra dock apps. It is **not** a supported Ecopages extension API — app authors should replace `devToolbar.package` instead.

## Package layout

- `src/bootstrap.ts` — injects toolbar CSS into `document.head`, boots navigation telemetry, and mounts `eco-dev-toolbar`
- `src/shell/eco-dev-toolbar.tsx` — Radiant light-DOM host (JSX `render()`, no shadow root); panel positioning is pure CSS
- `src/shell/motion.ts` — WAAPI motion for stealth dock reveal only; panel show/hide is CSS
- `src/apps/*-panel.tsx` — Radiant JSX panels (navigation, deps, islands, a11y, settings)
- `src/api/` — manifest and app contracts
- `src/apps/` — built-in toolbar apps
- `src/shell/` — custom element host, SVG icons, styles, and `ensureDevToolbarStyles()` (optional CSS override for BYO toolbars)
