# @ecopages/codemod

Codemods for migrating ecopages to the latest patterns.

## Installation

```bash
bun install
```

## Usage

### Migrate Pages to `eco.page()`

Transforms pages from legacy separate exports pattern to consolidated API:

```bash
npx jscodeshift -t packages/codemod/src/transforms/migrate-to-eco-page.ts \
  --parser tsx \
  --dry \
  path/to/pages/
```

### Migrate Components to `eco.component()`

Transforms components from legacy `.config` assignment to consolidated API:

```bash
npx jscodeshift -t packages/codemod/src/transforms/migrate-to-eco-component.ts \
  --parser tsx \
  --dry \
  path/to/components/
```

## Options

| Option    | Description                              |
| --------- | ---------------------------------------- |
| `--dry`   | Preview changes without writing to files |
| `--print` | Print transformed output to stdout       |
| `-v 2`    | Verbose output showing all changes       |

## What Gets Transformed

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
