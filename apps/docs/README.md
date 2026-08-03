# Ecopages Docs

This documentation application serves as a comprehensive guide to the functionalities and operations of ecopages.

It encompasses valuable information detailing its usage and provides a thorough explanation of its working mechanisms.

The aim is to offer users a clear understanding of how to effectively utilize ecopages and leverage its capabilities to their full extent.

The docs shell uses `@ecopages/radiant-ui` for its responsive navigation, breadcrumb, tabs, alerts, buttons, and theme switch. Sidebar and table-of-contents navigation listeners are registered only in the browser, so server rendering does not retain document listeners between pages.
Each MDX document imports the interactive components it renders, so client assets are scoped to the pages that use them.

## Local development

```bash
pnpm dev
```

Copy `.env.example` to `.env` and adjust port/base URL if needed.

The docs app deliberately does not prewarm the entire collection in development. Broad route prewarming competes
with interactive navigation for the same page-build pipeline; pages are rendered on demand instead. Client navigation
uses hover-only prefetching so the large sidebar does not fill that same server queue with speculative renders.

## Debugging slow first page load

Docs pages compile client JS on first open in dev. If a page feels slow, use the startup trace to see where time goes.

| Variable                      | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `ECOPAGES_STARTUP_TRACE=true` | Phase timings only — cleanest for perf work                              |
| `ECOPAGES_LOGGER_DEBUG=true`  | Same trace **plus** verbose core/processor logs (`ecopages dev --debug`) |

Example (trace only):

```bash
ECOPAGES_STARTUP_TRACE=true pnpm dev
```

Open a docs URL once, then check the terminal for `[ecopages:startup-trace]` lines. The `summary` row reports first-request SSR time, how many browser bundles ran, and total client JS bytes.

See also [packages/ecopages/README.md](../../packages/ecopages/README.md#debug-logging-and-startup-trace) for full env var reference.
