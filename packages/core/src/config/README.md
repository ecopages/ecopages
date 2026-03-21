# Config Layer

This directory contains the app-configuration finalization path for Ecopages.

## Purpose

The config layer answers one question:

How does one `eco.config.ts` become one stable, app-owned runtime/build configuration?

It is responsible for:

- validating integration, processor, and loader registration
- resolving semantic paths such as `html` and `404` templates
- creating app-owned runtime state such as the build adapter, build executor, build manifest, dev graph service, runtime specifier registry, and Node runtime manifest
- enforcing runtime capability requirements before startup

## Main Files

- `config-builder.ts`: the primary builder and config finalization boundary
- `config-builder.test.ts`: coverage for validation, path resolution, and runtime capability checks

## Ownership Rules

- Integrations and processors declare contributions.
- `ConfigBuilder.build()` decides ordering and validates compatibility.
- Runtime startup reuses finalized config/build state; it should not recompute manifest ownership.

## Output

The result of this layer is a built `EcoPagesAppConfig` with resolved absolute paths and app-owned runtime services attached under `appConfig.runtime`.

That built config is then consumed by server adapters, static generation, route rendering, and HMR.
