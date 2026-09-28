import { describe, expect, test } from 'vitest';
import { remarkFrontmatter, withContentMdxPlugins } from '../mdx.ts';

describe('withContentMdxPlugins', () => {
	test('prepends remark-frontmatter before caller remark plugins', () => {
		const marker = Symbol('marker');
		const result = withContentMdxPlugins({
			remarkPlugins: [[() => {}, marker]],
		});

		expect(result.remarkPlugins[0]).toBe(remarkFrontmatter);
		expect(result.remarkPlugins[1]).toEqual([expect.any(Function), marker]);
	});

	test('defaults rehype plugins to an empty list', () => {
		expect(withContentMdxPlugins().rehypePlugins).toEqual([]);
	});
});
