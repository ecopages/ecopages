# Development Invalidation

File-change classification and the batch entry that marks development results dirty.

`DevelopmentInvalidationService.planFileChange()` classifies one path. Config, files the config imports, and dotenv files are `runtime-restart`. Files the build recorded through `addDependency` or module closures are `recorded-input` and invalidate only the Page Browser Graphs, HTML cache entries, and entrypoints that bound them. `applyDevFileChanges({ changed, created, deleted })` plans a debounce window once and marks those results dirty. Rebuild happens on the next request that needs a result.

`created` stays separate because new Page files refresh the Route Registry. The Project Watcher collects filesystem events for one debounce window, then calls `applyDevFileChanges` once and broadcasts one browser update.

See [watchers](../../watchers/README.md) and [core](../../../README.md).
