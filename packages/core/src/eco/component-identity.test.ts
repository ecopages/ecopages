import { describe, expect, it } from 'vitest';
import type { EcoComponent } from '../types/public-types.ts';
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

	describe('getComponentOwner', () => {
		const identity = { id: 'card', file: '/app/card.kita.tsx', integration: 'kitajs' };

		it('lets the integration override win over the identity and the inherited owner', () => {
			const component = { config: { integration: 'lit', identity } } as EcoComponent;

			expect(getComponentOwner(component, 'react')).toBe('lit');
		});

		it('falls back to the identity, then to the inherited owner', () => {
			const withIdentity = { config: { identity } } as EcoComponent;
			const withoutOwner = { config: {} } as EcoComponent;

			expect(getComponentOwner(withIdentity, 'react')).toBe('kitajs');
			expect(getComponentOwner(withoutOwner, 'react')).toBe('react');
		});

		it('names no owner when nothing does and nothing is inherited', () => {
			expect(getComponentOwner({ config: {} } as EcoComponent)).toBeUndefined();
			expect(getComponentOwner(undefined)).toBeUndefined();
			expect(getComponentOwner(null, 'react')).toBe('react');
		});

		it('reads a bare config and a function component alike', () => {
			const component = Object.assign(() => 'card', { config: { identity } }) as unknown as EcoComponent;

			expect(getComponentOwner({ integration: 'lit', identity })).toBe('lit');
			expect(getComponentOwner(component)).toBe('kitajs');
		});
	});
});
