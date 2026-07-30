import type { EcoComponent, EcoDeclaredComponent } from '../types/public-types.ts';
import { UndeclaredComponentDependencyError } from '../errors/undeclared-component-dependency-error.ts';
import { getComponentIdentity } from './component-identity.ts';

export { getUndeclaredComponentDependencyMessage } from '../errors/undeclared-component-dependency-error.ts';

/**
 * @remarks
 * Declared components are produced by `eco.component()`, `eco.layout()`, and
 * `eco.html()` after the component-meta plugin injects `config.__eco`.
 */
export function isEcoDeclaredComponent(component: unknown): component is EcoDeclaredComponent {
	return (
		typeof component === 'function' &&
		typeof getComponentIdentity(component as EcoComponent)?.file === 'string' &&
		typeof getComponentIdentity(component as EcoComponent)?.integration === 'string'
	);
}

/**
 * @throws {UndeclaredComponentDependencyError} When the value lacks `config.__eco`.
 */
export function assertEcoDeclaredComponent(
	component: unknown,
	context: { parentComponentFile?: string } = {},
): asserts component is EcoDeclaredComponent {
	if (isEcoDeclaredComponent(component)) {
		return;
	}

	throw new UndeclaredComponentDependencyError(context.parentComponentFile);
}
