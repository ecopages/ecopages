# @ecopages/codemod

Automated code transformations for upgrading Ecopages projects. This is an internal workspace package and is not published to npm. To run a transform, check out the Ecopages repository at the release ref matching the installed `@ecopages/core` version, then run the examples below from that checkout with an absolute path to the project being migrated.

## Installation

```bash
pnpm install --filter @ecopages/codemod
```

Run transforms through the workspace package so they use the version from the matching Ecopages checkout. Pass absolute paths to the project files being migrated.

## Complete Migration Script

Run this from the Ecopages checkout to migrate components, layouts, includes, and pages in another project:

```bash
# Migrate components, layouts, and includes
pnpm --filter @ecopages/codemod exec jscodeshift \
  -t src/transforms/migrate-to-eco-component.ts \
  --parser tsx \
  /path/to/project/src/components \
  /path/to/project/src/layouts \
  /path/to/project/src/includes

# Migrate pages
pnpm --filter @ecopages/codemod exec jscodeshift \
  -t src/transforms/migrate-to-eco-page.ts \
  --parser tsx \
  /path/to/project/src/pages
```

## Individual Migrations

### Migrate Pages to `eco.page()`

Transforms pages from the legacy separate exports pattern to the consolidated API:

```bash
pnpm --filter @ecopages/codemod exec jscodeshift -t src/transforms/migrate-to-eco-page.ts --parser tsx /path/to/project/src/pages
```

### Migrate Components to `eco.component()`

Transforms components from the legacy `.config` assignment to the consolidated API:

```bash
pnpm --filter @ecopages/codemod exec jscodeshift -t src/transforms/migrate-to-eco-component.ts --parser tsx /path/to/project/src/components
```

### Migrate Core Entry Points

When upgrading to the role-based `@ecopages/core` exports, rewrite static imports and re-exports whose requested names are present in the destination entry. The transform also rewrites matching string-literal paths in `import.meta.resolve()` and `require.resolve()` calls. It leaves matching string-literal dynamic `import()` and `require()` calls unchanged and reports them for manual review because it cannot verify which exports the caller reads:

```bash
pnpm --filter @ecopages/codemod exec jscodeshift \
  -t src/transforms/migrate-core-entrypoints.ts \
  --parser tsx \
  /path/to/project/src
```

The transform leaves imports unchanged and reports them when a requested named export is not present in the destination role entry. Review those imports manually. Matching string-literal dynamic `import()` and `require()` calls stay unchanged with a warning, since their accessed names cannot be checked safely. Computed or other nonliteral module paths are left unchanged without a warning. `@ecopages/core/config/write-types` and `@ecopages/core/hmr/client/hmr-runtime` remain unchanged because core loads those entries by path.

## Options

| Option    | Description                              |
| --------- | ---------------------------------------- |
| `--dry`   | Preview changes without writing to files |
| `--print` | Print transformed output to stdout       |
| `-v 2`    | Verbose output showing all changes       |

## Transform Details

### Pages

**Before:**

```tsx
export const getStaticPaths = async () => ({ paths: [...] });
export const getStaticProps = async ({ pathname }) => ({ props: {...} });
export const getMetadata = ({ props }) => ({ title: '...' });

const Page: EcoComponent = () => <h1>...</h1>;
Page.config = { layout: BaseLayout };
export default Page;
```

**After:**

```tsx
export default eco.page({
  layout: BaseLayout,
  staticPaths: async () => ({ paths: [...] }),
  staticProps: async ({ pathname }) => ({ props: {...} }),
  metadata: ({ props }) => ({ title: '...' }),
  render: () => <h1>...</h1>,
});
```

### Components

**Before:**

```tsx
export const Counter: EcoComponent<Props> = ({ count }) => <my-counter />;
Counter.config = { dependencies: { scripts: ['./script.ts'] } };
```

**After:**

```tsx
export const Counter = eco.component<Props>({
	dependencies: { scripts: ['./script.ts'] },
	render: ({ count }) => <my-counter />,
});
```
