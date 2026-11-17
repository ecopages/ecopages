---
'@ecopages/ecopages-jsx': minor
'@ecopages/image-processor': minor
'@ecopages/dev-toolbar': minor
---

The `@ecopages/jsx`, `@ecopages/radiant` and `@ecopages/signals` peer and dependency ranges move to `^0.11.0` (`@ecopages/radiant-ui` and `@ecopages/radiant-themes` `^0.4.3` in the templates). Update them in your app with `pnpm add @ecopages/jsx@^0.11.0 @ecopages/radiant@^0.11.0 @ecopages/signals@^0.11.0`. Radiant 0.10.0 removed the `$name` companion bindings and the `bind` option on reactive members: read bindings from `this.$`, for example `{this.$.count}`. Radiant 0.11.0 replaces the `@query` options object with `@ref`, `@refAll`, `@query(selector)` and `@queryAll(selector)`, and scopes `data-ref` parts to the host that owns them. `npx @ecopages/codemod migrate-radiant-bindings` and `npx @ecopages/codemod migrate-radiant-refs` rewrite both.
