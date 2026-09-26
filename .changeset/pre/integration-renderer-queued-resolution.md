---
'@ecopages/core': patch
---

`IntegrationRenderer` now wires queued foreign-subtree resolution itself. Custom integrations call `this.resolveQueuedForeignSubtrees(html, this.getQueuedForeignSubtreeContext(input), renderQueuedChildren)` instead of passing an owner lookup, attribute stamping and asset de-duplication to `resolveQueuedHtml` by hand.

- `resolveQueuedHtml` no longer takes `queueLabel`, `applyAttributesToFirstElement` or `dedupeProcessedAssets`. Queue errors name the integration, for example `lit`, instead of a label such as `Lit` or `String`.
- The `@ecopages/core/route-renderer/orchestration/foreign-child/owning-renderer-resolution` subpath is no longer exported. Use `this.resolveOwningRenderer(...)` from a renderer subclass.
- `this.htmlTransformer.applyAttributesToFirstElement` is removed; the resolve step stamps root attributes itself.
