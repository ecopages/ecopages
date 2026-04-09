import { describe, expect, it } from 'vitest';
import type { EcoComponent } from '../../types/public-types.ts';
import { getComponentReference, registerRuntimeComponentHint } from './component-reference.ts';

describe('component references', () => {
	it('uses runtime hints to stabilize references across duplicate component instances', () => {
		const first = (() => null) as EcoComponent<Record<string, unknown>>;
		first.config = {
			integration: 'react',
		};

		const second = (() => null) as EcoComponent<Record<string, unknown>>;
		second.config = {
			integration: 'react',
		};

		registerRuntimeComponentHint(first, '/app/components/react-shell.react.tsx:10:1');
		registerRuntimeComponentHint(second, '/app/components/react-shell.react.tsx:10:1');

		expect(getComponentReference(first)).toBe(getComponentReference(second));
	});

	it('shares runtime hints across duplicate module instances', async () => {
		const duplicateModule = (await import(
			'./component-reference.ts?duplicate-instance' as string
		)) as typeof import('./component-reference.ts');
		const component = (() => null) as unknown as EcoComponent;

		duplicateModule.registerRuntimeComponentHint(component, '/app/components/react-shell.react.tsx:10:1');

		expect(getComponentReference(component)).toBe(duplicateModule.getComponentReference(component));
	});
});
