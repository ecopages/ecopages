---
'@ecopages/ecopages-jsx': minor
'@ecopages/image-processor': minor
---

`@ecopages/ecopages-jsx` now requires `@ecopages/jsx` and `@ecopages/radiant` `^0.14.0` as peer dependencies, and `@ecopages/image-processor` accepts `@ecopages/jsx` `^0.14.0` as its optional peer, up from 0.11. Upgrade `@ecopages/jsx`, `@ecopages/radiant` and `@ecopages/signals` to 0.14, and `@ecopages/radiant-ui` to 0.7, with this release. Radiant 0.14 reads an `@agentTool` config as plain values: a function for `inputSchema` or `outputSchema`, a getter or promise for `parse`, and a getter on any other field no longer work, so write the JSON Schema at build time and validate on the server.
