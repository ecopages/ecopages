import type { EcoComponent, EcoComponentConfig, GetMetadata } from '@ecopages/core';
import { describe, expectTypeOf, it } from 'vitest';
import type Post from './fixtures/post.mdx';
import type { config, getMetadata } from './fixtures/post.mdx';

describe('type surface of MDX modules', () => {
	it('types every .mdx default export as a loose Eco Component', () => {
		expectTypeOf<typeof Post>().toEqualTypeOf<EcoComponent<Record<string, unknown>>>();
	});

	it('cannot infer props from the MDX source, so callers are unchecked', () => {
		const props: Parameters<typeof Post>[0] = { anything: 1, goes: 'here' };
		expectTypeOf(props).toEqualTypeOf<Record<string, unknown>>();
		// @ts-expect-error props must still be an object
		const notProps: Parameters<typeof Post>[0] = 'text';
		void notProps;
	});

	it('types the config and getMetadata exports', () => {
		expectTypeOf<typeof config>().toEqualTypeOf<EcoComponentConfig | undefined>();
		expectTypeOf<typeof getMetadata>().toEqualTypeOf<GetMetadata | undefined>();
	});
});
