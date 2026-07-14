# Ecopages Docs

This documentation application serves as a comprehensive guide to the functionalities and operations of ecopages.

It encompasses valuable information detailing its usage and provides a thorough explanation of its working mechanisms.

The aim is to offer users a clear understanding of how to effectively utilize ecopages and leverage its capabilities to their full extent.

## Local development

```bash
pnpm dev
```

Copy `.env.example` to `.env` and adjust port/base URL if needed.

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
