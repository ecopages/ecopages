import { describe, expect, it } from 'vitest';
import { bindComponentIdentity, getComponentIdentity } from './component-identity.ts';

describe('component identity', () => {
	it('merges canonical attribution into factory options', () => {
		const config = bindComponentIdentity(
			{ id: 'layout', file: '/app/layout.tsx', integration: 'react' },
			{ render: () => null },
		);

		expect(config.identity).toEqual({
			id: 'layout',
			file: '/app/layout.tsx',
			integration: 'react',
		});
	});

	it('reads identity from a config through the accessor', () => {
		expect(
			getComponentIdentity({
				identity: { id: 'page', file: '/app/page.tsx', integration: 'react' },
			}),
		).toEqual({ id: 'page', file: '/app/page.tsx', integration: 'react' });
	});
});
