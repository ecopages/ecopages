import { describe, expect, it } from 'vitest';
import { eco } from './eco.ts';
import { assertEcoDeclaredComponent, isEcoDeclaredComponent } from './eco-declared-component.ts';
import { UndeclaredComponentDependencyError } from '../errors/undeclared-component-dependency-error.ts';

describe('eco-declared-component', () => {
	it('accepts eco.component results with identity', () => {
		const Button = eco.component({
			identity: {
				id: 'button',
				file: '/app/components/button.kita.tsx',
				integration: 'kitajs',
			},
			render: () => '<button />',
		});

		expect(isEcoDeclaredComponent(Button)).toBe(true);
		expect(() => assertEcoDeclaredComponent(Button)).not.toThrow();
	});

	it('rejects plain functions and components without identity', () => {
		const plainFunction = () => '<div />';

		expect(isEcoDeclaredComponent(plainFunction)).toBe(false);
		expect(() => assertEcoDeclaredComponent(plainFunction)).toThrow(UndeclaredComponentDependencyError);
	});
});
