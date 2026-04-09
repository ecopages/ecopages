# Runtime Adapters

This directory contains the runtime-host integration layer for Ecopages.

## Purpose

Adapters translate app-owned core services into concrete runtime behavior at the host boundary. Bun remains the direct core runtime, while Node compatibility is driven by the Ecopages CLI thin-host path and reuses internal adapter pieces here.

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

- `bun/`: Bun server adapter, lifecycle coordination, bridge, and HMR transport
- `node/`: internal Node compatibility adapter pieces used by the CLI thin-host path
- `shared/`: runtime-neutral adapter helpers used by both hosts

## Ownership Boundary

The adapter layer is transport-oriented.

Core services still own:

- config finalization
- build-manifest assembly
- server loading
- invalidation classification
- route rendering orchestration
