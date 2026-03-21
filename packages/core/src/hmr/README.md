# HMR Layer

This directory contains the framework-owned hot-update strategy contracts used by runtime adapters and integrations.

## Purpose

The HMR layer separates change classification from update execution.

It is responsible for:

- defining the shared HMR manager and strategy contracts
- letting integrations contribute framework-specific update strategies
- keeping adapter transports independent from update policy

## How It Fits

1. `ProjectWatcher` observes file changes.
2. `DevelopmentInvalidationService` classifies the change.
3. The active HMR manager selects a strategy.
4. The strategy coordinates browser rebuilds, metadata reloads, and client broadcasts.

## Design Rule

Generic invalidation policy belongs in core services.
Framework-specific update behavior belongs in HMR strategies.
Runtime-specific WebSocket or event-stream transport belongs in adapters.
