# Build Layer

This directory contains the runtime-neutral build contract used across Ecopages, the Bun-native adapter that currently uses esbuild under the hood, and the explicit host-owned Vite compatibility boundary.

## Files

- `build-adapter.ts`: shared build interfaces, explicit Bun-native versus Vite-host ownership helpers, app-owned adapter/executor helpers, and compatibility fallback helpers for older Bun-native call paths.
- `build-types.ts`: plugin bridge types used by integrations and processors.
- `esbuild-build-adapter.ts`: the concrete Bun-native adapter implementation. It is compatibility infrastructure, not strategic architecture.
- `dev-build-coordinator.ts`: development-only orchestration around the temporary Bun-native esbuild backend.
- `*.test.ts`: focused regression coverage for plain builds and development serialization and recovery.

## Responsibilities

The build layer is intentionally split into two parts.

`BuildExecutor` is the runtime-facing contract.

- It is the narrow facade stored on `appConfig.runtime.buildExecutor`.
- It answers only how a given app instance should execute builds right now.
- the Bun-native adapter satisfies this contract directly in plain flows.
- `DevBuildCoordinator` also satisfies this contract by wrapping the temporary Bun-native esbuild adapter with development-only serialization and recovery policy.

`EsbuildBuildAdapter` is the current Bun-native backend. It knows how to:

- load the esbuild module
- translate Ecopages `BuildOptions` into esbuild options
- bridge Ecopages build plugins into esbuild hooks
- normalize build output, logs, and dependency graph metadata
- detect the subset of runtime faults that mean the esbuild worker protocol is corrupted

`ViteHostBuildAdapter` is a boundary marker, not a real backend. It exists so app/runtime state can represent that Vite owns host-side build execution instead of silently falling back to a framework-owned esbuild path.

`DevBuildCoordinator` is the development policy layer. It exists because one app/runtime can have many build callers during dev mode, including:

- page module imports
- HMR entrypoint builds
- script and asset processors
- React integration build paths

Those callers must not race each other against one long-lived esbuild worker. The coordinator therefore owns temporary compatibility policy for the Bun-native path:

- serialized access to the shared adapter in development
- recycling warm Node-target esbuild sessions between builds
- recovery from known esbuild worker protocol faults

## Default Flow

Each `EcoPagesAppConfig` owns explicit build ownership, a build adapter, a build manifest, and a `buildExecutor` in `appConfig.runtime`. `ConfigBuilder.build()` now creates that app-owned build state up front so later runtime startup can reuse it rather than mutating a shared adapter.

When a Bun server adapter starts in watch mode, it replaces that executor with a per-app `DevBuildCoordinator`. Vite-hosted flows should not use that coordinator; the host owns watch, graph, and HMR policy there. Build consumers then either call the executor directly or pass it explicitly to the top-level `build()` helper.

The exported `defaultBuildAdapter` and top-level `getTranspileOptions()` helper are compatibility fallbacks only. New runtime code should prefer app-owned access through `getAppBuildAdapter()`, `getAppBuildExecutor()`, and `getAppTranspileOptions()`.

The same rule applies to source-module loading: host-owned import behavior must be injected through abstract runtime state rather than imported directly into core services.

Plugins are part of app-owned manifest or per-build input now. The source build contract no longer exposes adapter-level plugin registration, which keeps build composition scoped to an app/runtime instance instead of leaking across instances.

HMR callers follow the same ownership model. Integration-specific runtime aliasing stays with the integration that owns those specifiers, rather than in generic core HMR bundling.

## Orchestration Diagram

```mermaid
flowchart TD
    Config["ConfigBuilder.build()"] --> DefaultExec["appConfig.runtime.buildExecutor = createAppBuildExecutor(app adapter, manifest)"]
    Adapter["Server adapter initialize() in watch mode"] --> DevExec["appConfig.runtime.buildExecutor = DevBuildCoordinator"]
    Caller["Any build caller with app/runtime context"] --> Build["executor.build(options) or build(options, executor)"]
    Build --> Executor["BuildExecutor"]
    Executor --> Coordinator["DevBuildCoordinator.build()"]
    Coordinator --> Backend["EsbuildBuildAdapter.buildOrThrow()"]
    Executor -->|plain flow| Direct["EsbuildBuildAdapter.build()"]
    Backend --> Result["BuildResult"]
    Direct --> Result["BuildResult"]
    Result --> Browser["Browser consumes emitted bundle directly"]
```

## Recovery Model

The recovery path is narrow on purpose. The coordinator only treats an error as recoverable when `EsbuildBuildAdapter.isEsbuildProtocolError()` matches one of the known worker-protocol failure signatures.

When that happens, recovery does three things in order:

1. Reset the serialized queue so future builds are not stuck behind a wedged promise.
2. Stop the current esbuild service instance.
3. Increment the esbuild module generation so the next import gets a fresh worker instance.

After that reset, the coordinator retries the failed build once.

## Why Explicit App Ownership

There are many build callsites across core and integrations. The coordinator still needs to stay centralized for the remaining Bun-native compatibility path, but process-global installation hid the real dependency and tied behavior to startup order.

The explicit app-owned executor model keeps the design honest:

- each app/runtime owns its own build executor
- development policy stays in one place (`DevBuildCoordinator`) for the remaining Bun-native path only
- callers with app context use that executor explicitly instead of consulting global state
- tests can still instantiate `EsbuildBuildAdapter`, `ViteHostBuildAdapter`, or `DevBuildCoordinator` directly when they want the raw ownership boundary or compatibility backend only

## Testing Strategy

The build tests are split by concern.

- `build-adapter.test.ts` verifies plain backend behavior and plugin bridging.
- `build-adapter-serialization.test.ts` verifies development orchestration behavior such as serialization, warm-session recycling, and protocol-fault recovery.

If you change the build orchestration rules, update the coordinator tests first. If you change esbuild option mapping or plugin behavior, update the backend tests first.
