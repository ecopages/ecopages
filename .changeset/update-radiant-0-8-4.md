---
'@ecopages/ecopages-jsx': patch
'@ecopages/image-processor': patch
'@ecopages/dev-toolbar': patch
---

The `@ecopages/jsx` and `@ecopages/radiant` peer and dependency ranges move to `^0.8.4` (`@ecopages/signals` `^0.8.4`, `@ecopages/radiant-ui` `^0.3.6` in the templates). Update them in your app with `pnpm add @ecopages/jsx@^0.8.4 @ecopages/radiant@^0.8.4 @ecopages/signals@^0.8.4`.

Radiant 0.8.4 answers a `context-request` with the context value, as the community context protocol specifies, so a manual `ContextRequestEvent` callback receives the value rather than the provider, and the unused `context-on-mount` and `context-mounted` events are removed. The Radiant agent skill in the templates now covers manual requests and other protocol libraries.
