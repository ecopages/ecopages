# Development Invalidation

File-change classification and the batch entry that marks development results dirty.

`DevelopmentInvalidationService.planFileChange()` classifies one path. Config, files the config imports, and dotenv files are `runtime-restart`. Route files are `route-source`; other server files and recorded build inputs are `source`. Browser builds return their plugin inputs and module closures on `BuildResult`, and route-module closures are bound to their source route. HTML entries register the route closure, browser graph, processed asset, and render-shell inputs they used, so source and processor-owned asset edits invalidate only matching entries. An `additionalWatchPaths` match clears HTML cache entries because the framework cannot infer which pages consume an arbitrary watched file. The Page Browser Graph and HMR entrypoint reverse lookups use the same index. `applyDevFileChanges({ changed, created, deleted })` plans a debounce window once and marks those results dirty. Rebuild happens on the next request that needs a result.

`created` stays separate because new Page files refresh the Route Registry. The Project Watcher collects filesystem events for one debounce window, then calls `applyDevFileChanges` once and broadcasts one browser update.

See [watchers](../../watchers/README.md) and [core](../../../README.md).
