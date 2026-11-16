---
'@ecopages/codemod': minor
---

Add the `migrate-radiant-bindings` transform for `@ecopages/radiant` 0.10.0, which removed the `$name` companion bindings and the `bind` option. Run `npx @ecopages/codemod migrate-radiant-bindings src`. It rewrites `this.$count` to `this.$.count` in JSX and in plain code, reads of a custom `bind: 'name'` to `this.$.<field>`, removes literal `bind` options, and adds the members it rewrote to the `RadiantElement<{ ... }>` or `RadiantController<{ ... }>` type argument. It reports with file and line what it cannot rewrite safely, such as `defineReactiveBinding`, `shouldAutoBindReactiveMembers`, `ReactiveBindingOption` imports and computed `$` access.
