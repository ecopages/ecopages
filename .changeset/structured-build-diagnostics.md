---
'@ecopages/core': minor
---

Build errors keep their details. A failed build's logs now carry Rolldown's `code`, `plugin`, `hook`, `id`, `loc`, `frame` and `stack` next to `message`, and the errors Ecopages raises from them name the plugin, the file and the position. An error thrown by a build plugin, in `setup`, a resolve or load callback or its `transform`, names that plugin and the file it was handling, and a successful build returns its warnings. During `ecopages dev`, when a client-side module that the dev server sends to the browser, such as a `*.script.ts` file or a hydrated component, fails to build, the error is shown at the bottom of the page until the next update.

**Breaking:** the `BuildLog` type is no longer exported from `@ecopages/core/build/build-adapter`. Type a log entry as `BuildResult['logs'][number]`.
