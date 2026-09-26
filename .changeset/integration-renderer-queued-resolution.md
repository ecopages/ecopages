---
'@ecopages/core': patch
---

`IntegrationRenderer` now wires queued foreign-subtree resolution itself. Custom integrations call `this.resolveQueuedForeignSubtrees(html, this.getQueuedForeignSubtreeContext(input), renderQueuedChildren)` instead of passing an owner lookup, attribute stamping and asset de-duplication to `resolveQueuedHtml` by hand.

- `resolveQueuedHtml` no longer takes `queueLabel`, `applyAttributesToFirstElement` or `dedupeProcessedAssets`. Queue errors name the integration, for example `lit`, instead of a label such as `Lit` or `String`.
- `this.htmlTransformer.applyAttributesToFirstElement` is removed; the resolve step stamps root attributes itself.
