# Config Layer

This directory contains the app-configuration finalization path for Ecopages.

## Purpose

The config layer answers one question:

How does one `eco.config.ts` become one stable, app-owned runtime/build configuration?

It is responsible for:

- validating integration, processor, and loader registration
- resolving semantic paths such as `html` and `404` templates
- selecting explicit build ownership and creating app-owned runtime state such as the build adapter, build executor, build manifest, dev graph service, runtime specifier registry, and remaining compatibility-only runtime state
- enforcing runtime capability requirements before startup
- carrying host-injected runtime dependencies only through abstract slots such as host module loaders, never through bundler-specific core defaults

## Main Files

- `config-builder.ts`: the primary builder and config finalization boundary
- `config-builder.test.ts`: coverage for validation, path resolution, and runtime capability checks

## Ownership Rules

- Integrations and processors declare contributions.
- `ConfigBuilder.build()` decides ordering, validates compatibility, and seals build ownership for the finalized app config.
- Runtime startup reuses finalized config/build state; it should not recompute manifest ownership.

Bun-native is the default ownership path. Vite-host ownership is explicit and should be selected during config construction when a host-driven compatibility flow must avoid silently falling back to Bun build execution.

## Output

The result of this layer is a built `EcoPagesAppConfig` with resolved absolute paths and app-owned runtime services attached under `appConfig.runtime`.

That built config is then consumed by server adapters, static generation, route rendering, and HMR.
