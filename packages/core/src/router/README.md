# Router Layer

This directory contains route discovery, matching, and browser-side navigation infrastructure.

## Purpose

The router layer determines what route is being handled and how the client runtime coordinates navigation.

It is responsible for:

- filesystem route scanning and matching
- explicit-route support and response matching
- client-side navigation coordination and ownership handoff
- keeping route discovery separate from rendering execution

## Main Areas

- server-side route discovery and matchers used by adapters
- `client/`: shared browser-side navigation coordination

## Relationship To Rendering

The router layer answers which route should run.
The route-renderer layer answers how that route gets rendered.

Keeping those seams separate avoids mixing route ownership, module loading, and component orchestration into one service.
