import { describe, expect, it } from 'vitest';
import type { EcoComponent } from '../../types/public-types.ts';
import { getComponentReference } from './component-reference.ts';

describe('component references', () => {
	it('prefers injected component metadata when available', () => {
		const component = (() => null) as EcoComponent<Record<string, unknown>>;
		component.config = {
			__eco: {
				id: 'react-shell',
				file: '/app/components/react-shell.react.tsx',
				integration: 'react',
			},
			integration: 'react',
		};

		expect(getComponentReference(component)).toBe('react-shell');
	});

	it('shares fallback references across duplicate module instances for the same component object', async () => {
		const duplicateModule = (await import(
			'./component-reference.ts?duplicate-instance' as string
		)) as typeof import('./component-reference.ts');
		const component = (() => null) as unknown as EcoComponent;

		expect(getComponentReference(component)).toBe(duplicateModule.getComponentReference(component));
	});

	it('caches fallback references for repeated lookups on the same component instance', () => {
		const component = (() => null) as EcoComponent<Record<string, unknown>>;

		expect(getComponentReference(component)).toBe(getComponentReference(component));
	});
});
