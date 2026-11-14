# @ecopages/codemod

Codemods that migrate an Ecopages project to the current patterns. Each transform is a [jscodeshift](https://github.com/facebook/jscodeshift) module.

The package follows the Ecopages release train. Use the version that matches the `@ecopages/core` you upgrade to.

## Run

From the project root, with no install:

```bash
npx @ecopages/codemod <transform> [paths...]
```

Paths default to `src`. Extra flags pass through to jscodeshift, so `--dry --print` previews without writing files. `npx @ecopages/codemod --list` prints the transforms. Format the result afterwards, since the raw output indents rewritten lines with extra tabs.

## Transforms

| Transform                  | Added in | Migrates                                                                        |
| -------------------------- | -------- | ------------------------------------------------------------------------------- |
| `migrate-data-hooks`       | 0.9.0    | `staticProps` and `staticPaths` of `eco.page()` to `props` and `paths`          |
| `migrate-to-eco-page`      | 0.3.0    | Module-level data exports and `Page.config` to `eco.page()`; runs the one above |
| `migrate-to-eco-component` | 0.3.0    | `Component.config` assignments to `eco.component()`                             |
| `migrate-core-entrypoints` | 0.3.0    | Imports from `@ecopages/core` to the role-based entry points                    |

A transform leaves code it cannot rewrite safely unchanged and reports it, so the old API still fails loudly. Rename those by hand. Transforms leave already-migrated code unchanged, so running one twice is safe.

The release notes of each core version name the transform that goes with its breaking changes.
