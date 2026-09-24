# Runtime Adapters

This directory contains the runtime-host integration layer for Ecopages.

## Purpose

Adapters translate app-owned core services into concrete runtime behavior at the host boundary. Bun and Node are peers: with the default `adapter: 'auto'`, `createApp()` picks the Bun adapter when the process runs on Bun and the Node adapter otherwise, and the `ecopages` CLI runs apps on Bun when the command is launched through Bun (or with `--runtime bun`) and on Node otherwise.

They are responsible for:

- starting and stopping runtime-specific servers or thin hosts
- delegating startup into framework-owned loaders and services
- bridging runtime-specific request/response or HMR transport details
- keeping host/runtime transport details out of generic core orchestration

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
    - `shared/hmr/` — HMR HTML inject helpers, shared HMR manager, entrypoint registrar
    - `shared/runtime/` — shared server adapter, route handler, application adapter, static builder, port/bootstrap utilities (`PortManager` on dev and preview bind, Clack confirm on TTY port collisions)
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
- On Node, `attachNodeHttpWebSocketUpgrades` owns the unmatched-upgrade policy. `/_hmr` (dev only) and user routes are handled; anything else is destroyed unless `passthroughUnmatched` leaves it for a host that shares the server, such as Vite.
- HMR endpoints and Bun's `development` serve mode follow the `dev` flag only.
