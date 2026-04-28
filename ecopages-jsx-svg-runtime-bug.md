# ecopages/jsx SVG Runtime Bug

## Summary

`@ecopages/jsx` client-side DOM rendering can produce incorrect SVG element names for nested SVG content rendered inside normal HTML templates.

Observed examples:

- `<linearGradient>` becomes `<lineargradient>`
- `<feDropShadow>` becomes `<fedropshadow>`

The JSX source and SSR markup are correct. The corruption happens in the client DOM runtime during template cloning and namespace normalization.

## Affected Version

- `@ecopages/jsx@0.3.0-alpha.2`

## User-Visible Impact

- SVG filters and gradients can fail because SVG element names are case-sensitive.
- Components that render correctly on the server can break after client hydration or client-side rerender.
- The bug is easy to miss because the authored JSX and serialized markup look correct before the client runtime touches the tree.

## Repro Shape

This pattern is sufficient to trigger the issue:

```tsx
export function Example() {
	return (
		<div>
			<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
				<defs>
					<linearGradient id="gradient">
						<stop offset="0%" stop-color="#000" />
						<stop offset="100%" stop-color="#fff" />
					</linearGradient>
					<filter id="shadow">
						<feDropShadow dx="0" dy="2" stdDeviation="2" />
					</filter>
				</defs>
				<rect width="100" height="100" fill="url(#gradient)" filter="url(#shadow)" />
			</svg>
		</div>
	);
}
```

Important detail:

- The root render context is HTML.
- The `svg` subtree is nested inside an HTML template.
- The runtime builds the template through `template.innerHTML`, then attempts namespace repair.

## Root Cause

There are two related issues in the client runtime.

### 1. Nested SVG subtrees are skipped unless the immediate mount context is already SVG

The namespace normalization path only runs when the current template fragment is mounted under an existing SVG context.

That means this works poorly:

- HTML parent
- nested `<svg>` inside the template

Because the parent context is HTML, the runtime returns early and does not normalize the nested SVG subtree.

Relevant runtime logic in the distributed build:

- `dist/index.js`: `C3(...)`
- `dist/client.js`: `O0(...)`

### 2. Recreated SVG elements reuse the lowercased parsed localName

When the runtime does recreate an element with `createElementNS(...)`, it uses `element.localName` directly.

After HTML parsing, camel-cased SVG names have already been lowercased, for example:

- `linearGradient` -> `lineargradient`
- `feDropShadow` -> `fedropshadow`

Recreating the element with the already-lowercased name preserves the invalid tag name instead of restoring the correct SVG name.

Relevant runtime logic in the distributed build:

- `dist/index.js`: `E3(...)`
- `dist/client.js`: `A0(...)`

## Expected Behavior

The client runtime should:

1. Traverse nested SVG subtrees even when the template is mounted under HTML.
2. Recreate SVG elements with canonical SVG tag names when the parser has lowercased camel-cased names.

## Fix Strategy

During template normalization:

1. Derive each child element namespace from the parent context.
2. Treat a child `<svg>` inside HTML as a namespace boundary into SVG.
3. Recurse through the subtree with namespace-aware handling.
4. When recreating SVG elements, map lowercased parser names back to canonical SVG element names.

## Suggested Regression Test

Add a DOM-render or hydration test that:

1. Renders a template containing HTML -> SVG -> `defs` -> `linearGradient` and `feDropShadow`
2. Mounts or hydrates it through the client runtime
3. Asserts on `localName` or serialized markup

Expected assertions:

```ts
expect(node.localName).toBe('linearGradient');
expect(node.localName).toBe('feDropShadow');
```

## Why This Is a Runtime Bug, Not a Component Bug

- The authored JSX uses the correct tag names.
- The static markup is correct before client DOM normalization runs.
- The failure appears when the client runtime reconstructs DOM from parsed template content.
