# Runtime Adapters

This directory contains the runtime-host integration layer for Ecopages.

## Purpose

Adapters translate app-owned core services into concrete runtime behavior on Bun and Node.

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
- `node/`: Node server adapter plus thin-host runtime bootstrap path
- `shared/`: runtime-neutral adapter helpers used by both hosts

## Ownership Boundary

The adapter layer is transport-oriented.

Core services still own:

- config finalization
- build-manifest assembly
- server loading
- invalidation classification
- route rendering orchestration
