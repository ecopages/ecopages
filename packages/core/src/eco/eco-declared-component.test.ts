import { describe, expect, it } from 'vitest';
import { eco } from './eco.ts';
import { assertEcoDeclaredComponent, isEcoDeclaredComponent } from './eco-declared-component.ts';
import { UndeclaredComponentDependencyError } from '../errors/undeclared-component-dependency-error.ts';

describe('eco-declared-component', () => {
	it('should accept eco.component results with __eco metadata', () => {
		const Button = eco.component({
			__eco: {
				id: 'button',
				file: '/app/components/button.kita.tsx',
				integration: 'kitajs',
			},
			render: () => '<button />',
		});

		expect(isEcoDeclaredComponent(Button)).toBe(true);
		expect(() => assertEcoDeclaredComponent(Button)).not.toThrow();
	});

	it('should reject plain functions and components without __eco metadata', () => {
		const plainFunction = () => '<div />';

		expect(isEcoDeclaredComponent(plainFunction)).toBe(false);
		expect(() => assertEcoDeclaredComponent(plainFunction)).toThrow(UndeclaredComponentDependencyError);
	});
});
