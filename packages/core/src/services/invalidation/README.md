# Development Invalidation

File-change classification and the batch entry that marks development results dirty.

`DevelopmentInvalidationService.planFileChange()` classifies one path. `applyDevFileChanges({ changed, created, deleted })` plans a debounce window once and invalidates server modules, Page Browser Graph records, HTML cache entries, and route-module records. Rebuild happens on the next request that needs a result.

`created` stays separate because new Page files refresh the Route Registry. The Project Watcher collects filesystem events for one debounce window, then calls `applyDevFileChanges` once and broadcasts one browser update.

See [watchers](../../watchers/README.md) and [core](../../../README.md).
