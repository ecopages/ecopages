import { describe, expect, it } from 'vitest';
import { bindComponentIdentity, getComponentIdentity, getComponentOwner } from './component-identity.ts';

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

	it('resolves ownership by override, identity, then inherited owner', () => {
		expect(
			getComponentOwner(
				{
					integration: 'lit',
					identity: { id: 'page', file: '/app/page.tsx', integration: 'react' },
				},
				'kitajs',
			),
		).toBe('lit');
		expect(
			getComponentOwner({ identity: { id: 'page', file: '/app/page.tsx', integration: 'react' } }, 'kitajs'),
		).toBe('react');
		expect(getComponentOwner({}, 'kitajs')).toBe('kitajs');
		expect(getComponentOwner({})).toBeUndefined();
	});
});
