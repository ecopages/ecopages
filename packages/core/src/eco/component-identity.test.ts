import { describe, expect, it } from 'vitest';
import type { EcoComponent } from '../types/public-types.ts';
import { bindComponentIdentity, getComponentIdentity } from './component-identity.ts';

describe('component identity', () => {
	it('binds and reads canonical attribution', () => {
		const component = (() => null) as unknown as EcoComponent;
		bindComponentIdentity(component, { id: 'layout', file: '/app/layout.tsx', integration: 'react' });
		expect(getComponentIdentity(component)).toEqual({
			id: 'layout',
			file: '/app/layout.tsx',
			integration: 'react',
		});
	});

	it('reads legacy metadata while consumers migrate', () => {
		expect(
			getComponentIdentity({
				__eco: { id: 'page', file: '/app/page.tsx', integration: 'react' },
			}),
		).toEqual({ id: 'page', file: '/app/page.tsx', integration: 'react' });
	});
});
