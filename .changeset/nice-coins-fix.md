---
'@ecopages/browser-router': major
'@ecopages/core': major
'@ecopages/react-router': major
'@ecopages/dev-toolbar': patch
---

Unify browser and React navigation through core's shared commit pipeline and fix toolbar navigation-owner telemetry.

**Breaking:** `@ecopages/browser-router` no longer exports `ViewTransitionManager`; import `runNavigationViewTransition` from `@ecopages/core/router/navigation-pipeline` or use `commitNavigationPage`. `@ecopages/react-router` no longer exports `morphHead`; use `commitNavigationPage` with the React render as its `swap` callback, or `prepareNavigationHead` when staged head work is needed. In `@ecopages/core`, `dispatchAfterSwap` and `schedulePageLoad` are no longer exported; use `completeNavigationLifecycle` to emit both post-swap events. `documentHasNamedViewTransitions` is now private; use `navigationHasNamedViewTransitions`. The script barrel no longer re-exports low-level rerun queue and registry operations; use the navigation pipeline's script activation APIs. These operations are owned by the shared pipeline so custom runtimes should use `@ecopages/core/router/navigation-pipeline` for document commits and listen to lifecycle events rather than dispatching or scheduling individual signals.
