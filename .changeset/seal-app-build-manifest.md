---
'@ecopages/core': minor
---

The app's build manifest is sealed once, with its plugins already split into a server list and a browser list, so a build request no longer filters a mixed list by environment on every read. The plugin order of a request is decided in one place and documented there: caller plugins, then the alias resolver, the manifest plugins, JSX ownership plugins, and source transforms.

**Breaking:** `AppBuildManifest` has `server` and `browser` instead of `plugins`. `createAppBuildManifest` takes the registrations and the browser runtime manifest, `sealAppBuildManifest(appConfig)` replaces `collectConfiguredAppBuildManifestContributions`, `createConfiguredAppBuildManifest` and `updateAppBuildManifest`, and `getAppServerBuildPlugins`, `getAppBrowserBuildPlugins`, `getServerBuildPlugins`, `getBrowserBuildPlugins` and `getBrowserRuntimeManifest` are removed. Read a list from `getAppBuildManifest(appConfig)`.
