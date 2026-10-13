---
'@ecopages/core': minor
---

Core owns the shared Integration render pipeline and exposes optional renderer hooks.

### Breaking Changes

`RouteRenderOrchestratorAdapter` and `IntegrationRenderer.createRouteRenderOrchestratorAdapter()` are removed. The route orchestrator calls the Integration renderer directly; HTML Pages now use `finalizeDocument()` for post-transform head reconciliation. `ForeignSubtreeExecutionService` and `ForeignSubtreeRenderPayload` are removed. Import `createQueuedRuntime()`, `executeComponentRender()`, `resolveQueuedHtml()`, and `resolveQueuedTokens()` from the foreign-child execution module, and pass `ComponentRenderResult` directly. `ComponentRenderResult.rootTag` and `IntegrationRenderer.getRootTagName()` are removed; use `rootAttributes` when the renderer must attach attributes.

To configure renderer behavior without a subclass, use `createIntegrationRenderer()` and map the former extension points to hooks: `renderComponent`, `composeChildren`, `normalizePageModule`, `collectPageBrowserGraphContribution`, `documentContributions`, `documentAttributes`, `buildIslandClientAssets`, `beforeRender`, and `transformDocumentHtml`. A custom queued renderer can also provide `renderQueuedChildren`.

Components whose `config.integration` override differs from their file identity now render and hydrate under that override consistently.
