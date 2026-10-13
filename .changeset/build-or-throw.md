---
'@ecopages/core': minor
---

A failed build now throws one error that lists every log with its plugin, file, code frame and stack. The config bundle, the server entry, the unified pages graph, collection server modules, page module imports, the dev transform server, the HTML Page module scripts and page script bundles used to format failed logs in their own way, and some joined `log.message` and dropped the rest. Page script bundles used to hide a failed build behind a "No build output" error.

**Breaking:** `build()` and `getTranspileOptions()` are removed from `@ecopages/core/build/build-adapter`, as is `getAppTranspileOptions()` and the `getTranspileOptions()` method of `BuildAdapter`. Run a build through the app's queue, `requireBuildQueue(appConfig).build(options)`, or call `buildOrThrow(appConfig, options, failure)` to get an error for a failed build. Browser defaults come from the request helpers.
