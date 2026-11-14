---
'@ecopages/core': minor
'@ecopages/react': minor
'@ecopages/lit': minor
'@ecopages/ecopages-jsx': minor
---

Render pages that mix Integrations faster. Each component's declared assets are resolved once instead of on every render, a route's shell assets are processed once per page in production, and Foreign Subtrees are placed in one pass over the host HTML. The rendered HTML is unchanged.

Breaking, for custom Integrations only: the `renderQueuedChildren` Integration hook now receives a single `resolveTokens(html)` callback as its third argument, in place of the token map and the per-token `resolveToken` callback. `resolveQueuedTokens` is no longer exported from `@ecopages/core/integration`; call `resolveTokens` instead.

Migration: in a custom Integration's `renderQueuedChildren`, replace the per-token lookup and `resolveQueuedTokens(...)` with one call to the `resolveTokens(html)` argument on the HTML that holds the queued tokens. First-party Integrations are already updated.
