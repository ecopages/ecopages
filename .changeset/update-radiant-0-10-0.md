---
'@ecopages/ecopages-jsx': minor
'@ecopages/image-processor': minor
'@ecopages/dev-toolbar': minor
---

The `@ecopages/jsx`, `@ecopages/radiant` and `@ecopages/signals` peer and dependency ranges move to `^0.10.0` (`@ecopages/radiant-ui` and `@ecopages/radiant-themes` `^0.4.2` in the templates). Update them in your app with `pnpm add @ecopages/jsx@^0.10.0 @ecopages/radiant@^0.10.0 @ecopages/signals@^0.10.0`. Radiant 0.10.0 removes the `$name` companion bindings and the `bind` option on reactive members: read bindings from `this.$`, for example `{this.$.count}`.
