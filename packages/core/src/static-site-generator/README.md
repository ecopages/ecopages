# Static Site Generation

This directory contains the static-build execution path used when Ecopages renders pages ahead of time.

## Purpose

The static-site generator reuses the same app-owned config, route matching, and rendering services that development and preview flows use, but drives them in a build-oriented loop.

It is responsible for:

- enumerating renderable routes
- rendering static outputs through the normal rendering pipeline
- respecting route-level constraints such as cache policy and unsupported dynamic server-only paths

## Design Rule

Static generation should follow the same ownership model as runtime rendering.

That means it should reuse:

- built app config
- route matching
- render orchestration
- asset processing

It should not invent a parallel rendering stack just for build mode.
