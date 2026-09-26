---
'@ecopages/core': patch
---

The `renderQueuedChildren` callback passed to `resolveQueuedHtml` no longer returns `assets`. No built-in integration ever returned any. The owning renderer reports the foreign component's assets, and host components' assets come from their declared dependencies. Return `{ html }`, `{ children }` or `{}`, typed as `QueuedForeignSubtreeChildRenderResult`.
