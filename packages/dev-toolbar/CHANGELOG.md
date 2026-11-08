# Changelog

## 0.6.1

No changes in this release.

## 0.6.0

### Minor Changes

- [#916](https://github.com/ecopages/ecopages/pull/916) [`09f64d9`](https://github.com/ecopages/ecopages/commit/09f64d954261b842c7cfbb64607ef9f8119ede06) Thanks [@andeeplus](https://github.com/andeeplus)! - Require `@ecopages/jsx`, `@ecopages/radiant`, and `@ecopages/signals` 0.6.0, and `@ecopages/radiant-ui` 0.3.0.

    Radiant 0.6.0 needs `@ecopages/jsx` 0.6.0. Apps still on 0.5 must upgrade those packages together.

## 0.5.0

No changes in this release.

## 0.4.0

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

### Patch Changes

- [#814](https://github.com/ecopages/ecopages/pull/814) [`0857ed4`](https://github.com/ecopages/ecopages/commit/0857ed44eb12f0cba2e47c257a56491ba3448021) Thanks [@andeeplus](https://github.com/andeeplus)! - Smaller packages. The published tarballs no longer include browser test files, test helpers and test fixtures, which imported a test runner that is not installed with the package, nor the architecture READMEs that live beside the source (the package README stays and links to them in the repository). `@ecopages/react`, `@ecopages/dev-toolbar` and `@ecopages/image-processor` also stop installing dependencies they never used.

## 0.3.0

### Minor Changes

- [#745](https://github.com/ecopages/ecopages/pull/745) [`bf2c0e4`](https://github.com/ecopages/ecopages/commit/bf2c0e4e14231f456cc9c7bc23edbcd63b72fbcf) Thanks [@andeeplus](https://github.com/andeeplus)! - Require `@ecopages/jsx`, `@ecopages/radiant`, and `@ecopages/signals` 0.4, and `@ecopages/radiant-ui` 0.2. The previous ranges included the broken 0.3.0 release and stopped before 0.4.0.

### Patch Changes

- [#449](https://github.com/ecopages/ecopages/pull/449) [`1990d16`](https://github.com/ecopages/ecopages/commit/1990d16622d61feb39b3184699755f6eda579093) Thanks [@andeeplus](https://github.com/andeeplus)! - React island props that contain text outside Latin-1, such as `€`, CJK characters or emoji, no longer crash server rendering. The islands hydrate with the same text, and the dev toolbar's Islands panel previews it instead of garbled characters.

- [#586](https://github.com/ecopages/ecopages/pull/586) [`f88f71a`](https://github.com/ecopages/ecopages/commit/f88f71a597dfb825ebea89e1bf9d8c02f98440da) Thanks [@andeeplus](https://github.com/andeeplus)! - Unify browser and React navigation through core's shared commit pipeline and fix toolbar navigation-owner telemetry.

    **Breaking:** `@ecopages/browser-router` no longer exports `ViewTransitionManager`; import `runNavigationViewTransition` from `@ecopages/core/router/navigation-pipeline` or use `commitNavigationPage`. `@ecopages/react-router` no longer exports `morphHead`; use `commitNavigationPage` with the React render as its `swap` callback, or `prepareNavigationHead` when staged head work is needed. In `@ecopages/core`, `dispatchAfterSwap` and `schedulePageLoad` are no longer exported; use `completeNavigationLifecycle` to emit both post-swap events. `documentHasNamedViewTransitions` is now private; use `navigationHasNamedViewTransitions`. The script barrel no longer re-exports low-level rerun queue and registry operations; use the navigation pipeline's script activation APIs. These operations are owned by the shared pipeline so custom runtimes should use `@ecopages/core/router/navigation-pipeline` for document commits and listen to lifecycle events rather than dispatching or scheduling individual signals.

    **Breaking (continued):** `@ecopages/browser-router`'s `DomSwapper` no longer has `morphHead`, `preloadStylesheets` or `flushScripts`; head work and script activation belong to the shared pipeline. `PrefetchOptions` requires `reloadAttribute`. `@ecopages/core/router/link-navigation-policy` no longer exports `assertHtmlPageResponse`: navigation accepts only `text/html` and `application/xhtml+xml` responses, so a server or test harness must send one of those types. Head reconciliation is now the same for both routers: after a navigation, head elements that the incoming page lacks are removed unless they carry the persist attribute, so elements injected into the head at runtime should carry it. The React router also activates head scripts that the incoming page adds.

- [#519](https://github.com/ecopages/ecopages/pull/519) [`ee6f61c`](https://github.com/ecopages/ecopages/commit/ee6f61c88c53c34ed0c9543e9121a61af2251a21) Thanks [@andeeplus](https://github.com/andeeplus)! - Show development build errors in the Dev Toolbar with a count badge and a cancelable event contract for custom clients, preserving the in-page fallback for unclaimed errors.

## 0.2.0

### Minor Changes

- [`8ee835b`](https://github.com/ecopages/ecopages/commit/8ee835baff535f70469cd9e63e398c65d04b4dee) Thanks [@andeeplus](https://github.com/andeeplus)! - Development toolbar reports island lifecycle per instance: hydrated, registered, or SSR-only.

All notable changes to `@ecopages/dev-toolbar` are documented here.

> Changelog tracking begins at version `0.2.0`. Prerelease history lives in git tags and GitHub Releases.
