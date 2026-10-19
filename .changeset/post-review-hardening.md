---
'@ecopages/core': patch
'@ecopages/react': patch
---

Fix four development and lifecycle edge cases:

- Calling `stop()`, then `start()`, then `stop()` again before the first stop finishes now leaves nothing running. Before, the queued `start()` brought the server back after the last `stop()` had resolved.
- In preview mode, the `start()` callback no longer runs, and the server-running notice is no longer logged, when `stop()` is called while the static build is still running.
- Editing a file that declares several React islands now hot-updates all of them, not only the last one. When an edit renames an island's declaration so the updated module no longer exports it, the page reloads instead of rendering another export of the file in its place.
- A build error from a script change now stays visible when the same save reloads the page: the browser shows it again after the reload, and on every later page load until the file is fixed. The error is sent once instead of twice.

Correction to 0.3.1: that release removed `IHmrManager.handleFileChange` and the `graphIdentities` fields from the integration contract, although it shipped as a patch. Integrations that implement or call them must adapt: call `handleFileChanges()` with a one-item list, and stop reading or setting `graphIdentities`.
