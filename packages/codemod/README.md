# @ecopages/codemod

Automated code transformations for upgrading older Ecopages project structures to the latest consolidated APIs (`eco.page()` and `eco.component()`).

## Installation

```bash
pnpm install
```

## Complete Migration Script

Run this from your project root to migrate your entire structure (components, layouts, includes, and pages) at once:

```bash
# Migrate components, layouts, and includes
npx jscodeshift \
  -t node_modules/@ecopages/codemod/src/transforms/migrate-to-eco-component.ts \
  --parser tsx \
  ./src/components \
  ./src/layouts \
  ./src/includes

# Migrate pages
npx jscodeshift \
  -t node_modules/@ecopages/codemod/src/transforms/migrate-to-eco-page.ts \
  --parser tsx \
  ./src/pages
```

## Individual Migrations

### Migrate Pages to `eco.page()`

Transforms pages from the legacy separate exports pattern to the consolidated API:

```bash
npx jscodeshift -t codemod/src/transforms/migrate-to-eco-page.ts --parser tsx path/to/pages/
```

### Migrate Components to `eco.component()`

Transforms components from the legacy `.config` assignment to the consolidated API:

```bash
npx jscodeshift -t codemod/src/transforms/migrate-to-eco-component.ts --parser tsx path/to/components/
```

### Migrate Core Entry Points

When upgrading to the role-based `@ecopages/core` exports, rewrite imports, re-exports, dynamic imports, `require()` calls, and `import.meta.resolve()` calls:

```bash
npx jscodeshift \
  -t node_modules/@ecopages/codemod/src/transforms/migrate-core-entrypoints.ts \
  --parser tsx \
  ./src
```

The transform leaves `@ecopages/core/config/write-types` and `@ecopages/core/hmr/client/hmr-runtime` unchanged because core loads those entries by path.

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
