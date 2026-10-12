# Runtime Adapters

This directory contains the runtime-host integration layer for Ecopages.

## Purpose

Adapters translate app-owned core services into concrete runtime behavior at the host boundary. Bun and Node are peers: with the default `adapter: 'auto'`, `createApp()` picks the Bun adapter when the process runs on Bun and the Node adapter otherwise, and the `ecopages` CLI runs apps on Bun when the command is launched through Bun (or with `--runtime bun`) and on Node otherwise.

They are responsible for:

- starting and stopping runtime-specific servers or thin hosts
- delegating startup into framework-owned loaders and services
- bridging runtime-specific request/response or HMR transport details
- keeping host/runtime transport details out of generic core orchestration

Shared shutdown cancels queued Page prewarming, waits for active prewarm renders and for Integration `setup()` calls still in flight, then calls each Integration's `teardown()` and clears its activation state. Cleanup attempts each resource even when an earlier step fails, then reports the errors. This releases runtime resources such as Lit workers after background renders finish using them.

They are not responsible for:

- deciding plugin lifecycle ordering
- owning server-module semantics
- owning browser bundling policy
- owning route rendering semantics

## Main Areas

- `bun/`: Bun server adapter, lifecycle coordination, bridge, HMR transport, and Bun user WebSocket lifecycle
- `node/`: Node server adapter, app shell, HTTP request bridge, HMR transport, and static preview server
- `shared/`: runtime-neutral adapter helpers used by both hosts, clustered by concern:
    - `shared/http/` — API response builders, request pipeline, middleware runner, define-api helpers, explicit-static and filesystem matchers
    - `shared/hmr/` — HMR HTML inject helpers, shared HMR manager, entrypoint registrar. In watch mode every HTML response is marked `no-store`, also when the host owns the dev client and core injects nothing
    - `shared/runtime/` — shared server adapter, route handler, application adapter, static builder, port/bootstrap utilities (`PortManager` on dev and preview bind, Clack confirm on TTY port collisions). Watch-mode `startDevWarmup()` finishes integration `setup()` before the server logs that it is listening. Declared prewarm paths are collected and rendered in the background, without delaying server readiness; failures include their stack in the log. The Project Watcher also finishes its initial filesystem subscription before readiness is advertised. Node `bootServer()` calls `completeInitialization` before the listen log, so Playwright's listen-log ready signal does not start tests during that warmup.
    - `shared/ws/` — WinterCG WebSocket lifecycle helpers and Node HTTP upgrade bridge (Bun-specific user WS lifecycle lives under `bun/`)

## Ownership Boundary

The adapter layer is transport-oriented.

Core services still own:

- config finalization
- build-manifest assembly
- server loading
- invalidation classification
- route rendering orchestration

Semantic 404/500 page selection and rendering belongs to `src/services/error-pages/`; adapters only turn its rendered body into runtime responses.

## Shared Request Contracts

- API handler errors and errors that escape `SharedServerAdapter.handleSharedRequest` resolve through `ApiRequestPipeline.handleError` on both runtimes: a thrown `Response`, then a client abort (499, Node only), then `app.onError`, then `HttpError`, then a 500 logged with its stack. `app.fetch()` therefore always resolves with a `Response`. Page render failures render the error page instead and do not reach `app.onError`.
- On Node, `attachNodeHttpWebSocketUpgrades` owns the unmatched-upgrade policy. `/_hmr` (dev only) and user routes are handled; anything else is destroyed.
- HMR endpoints and Bun's `development` serve mode follow the `dev` flag only.
