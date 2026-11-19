# @ecopages/codemod

## 0.10.1

No changes in this release.

## 0.10.0

### Minor Changes

- [#1252](https://github.com/ecopages/ecopages/pull/1252) [`0860a11`](https://github.com/ecopages/ecopages/commit/0860a117985d907749ac09d108aed04eff6170ce) Thanks [@andeeplus](https://github.com/andeeplus)! - New `migrate-middleware-locals` transform. It moves the `ctx.locals.x = value` assignments of a `FileRouteMiddleware` or `Middleware` into `createMiddleware` and `next({ x: value })`, moves the `locals` a simple dynamic page with a `middleware` list reads unconditionally in `render` into a new `props` hook and drops its `requires`, and prints a migration brief for the cases it leaves: `EcoMiddleware<Context>` forms, assignments it cannot move, pages that still declare `requires` or read `locals` in `render`, and `interface RequestLocals` augmentations of `@ecopages/core`, which type nothing now that the global interface is removed.

- [#1254](https://github.com/ecopages/ecopages/pull/1254) [`bf235ef`](https://github.com/ecopages/ecopages/commit/bf235ef0c62855d861ac432cce44adf30536472a) Thanks [@andeeplus](https://github.com/andeeplus)! - Add the `migrate-radiant-bindings` transform for `@ecopages/radiant` 0.10.0, which removed the `$name` companion bindings and the `bind` option. Run `npx @ecopages/codemod migrate-radiant-bindings src`. It rewrites `this.$count` to `this.$.count` in JSX and in plain code, reads of a custom `bind: 'name'` to `this.$.<field>`, removes literal `bind` options, and adds the members it rewrote to the `RadiantElement<{ ... }>` or `RadiantController<{ ... }>` type argument. It reports with file and line what it cannot rewrite safely, such as `defineReactiveBinding`, `shouldAutoBindReactiveMembers`, `ReactiveBindingOption` imports and computed `$` access.

    Add the `migrate-radiant-refs` transform for the ref/query split of `@ecopages/radiant` 0.11.0. Run `npx @ecopages/codemod migrate-radiant-refs src`. Without renaming fields, it rewrites `@query({ ref })` to `@ref()` or `@ref('name')`, `@query({ ref, all: true })` to `@refAll`, `@query({ selector })` to `@query(selector)` or `@queryAll(selector)`, and `createQuery(host, { ... })` to `createQuery(host, selector)` or `createQueryAll(host, selector)`. It drops `cache` and updates the imports. It reports with file and line `cache: true`, `QueryConfig` imports, options it cannot read, `getReactiveMember(...).set(...)`, controller identifiers containing `:`, string `ref` attributes in JSX, and `data-hydration-key` values in files that register controllers. After the run, the CLI explains the change it cannot detect: `@ref`, `@refAll`, `getRef`, `@onEvent({ ref })` and `@bindTo({ ref })` now only see the parts their own host owns.

## 0.9.0

### Patch Changes

- [#1216](https://github.com/ecopages/ecopages/pull/1216) [`48649de`](https://github.com/ecopages/ecopages/commit/48649defc0cdc6158685fa4c93bada71ca2c8719) Thanks [@andeeplus](https://github.com/andeeplus)! - Publish `@ecopages/codemod` to npm with a CLI: run `npx @ecopages/codemod <transform>` from a project to migrate it, with `--list` to see the transforms and jscodeshift flags such as `--dry --print` passed through. The transforms are also importable as `@ecopages/codemod/<transform>`.
