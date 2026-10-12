# Development Invalidation

File-change classification and the batch entry that marks development results dirty.

`DevelopmentInvalidationService.planFileChange()` classifies one path. Config, files the config imports, and dotenv files are `runtime-restart`. Route files are `route-source`; other server files and recorded build inputs are `source`. Browser builds return their plugin inputs and module closures on `BuildResult`, and route-module closures are bound to their source route. HTML entries register the route closure, browser graph, processed asset, and render-shell inputs they used. A route file evicts only the entries that recorded it. Source edits, processor-owned asset edits other than creations, and `additionalWatchPaths` matches clear every cached HTML document, because recorded inputs do not yet cover content collection virtual modules, Bun source imports, inferred foreign children or barrel targets. The Page Browser Graph and HMR entrypoint reverse lookups use the same index. `applyDevFileChanges({ changed, created, deleted })` plans a debounce window once and marks those results dirty. Rebuild happens on the next request that needs a result.

`created` stays separate because new Page files refresh the Route Registry. The Project Watcher collects filesystem events for one debounce window, then calls `applyDevFileChanges` once and broadcasts one browser update.

See [watchers](../../watchers/README.md) and [core](../../../README.md).
