import type { EcoComponent, EcoDeclaredComponent } from '../types/public-types.ts';

/**
 * @remarks
 * Declared components are produced by `eco.component()`, `eco.layout()`, and
 * `eco.html()` after the component-meta plugin injects `config.__eco`.
 */
export function isEcoDeclaredComponent(component: unknown): component is EcoDeclaredComponent {
	return (
		typeof component === 'function' &&
		typeof (component as EcoComponent).config?.__eco?.file === 'string' &&
		typeof (component as EcoComponent).config?.__eco?.integration === 'string'
	);
}

export function getUndeclaredComponentDependencyMessage(parentComponentFile?: string): string {
	const parentHint = parentComponentFile ? ` (declared by ${parentComponentFile})` : '';
	return `[ecopages] dependencies.components entries must be eco.component(), eco.layout(), or eco.html() components with __eco metadata${parentHint}. Plain functions and untyped components are not valid dependency entries.`;
}

/**
 * @remarks
 * Dependency collection and ownership validation call this instead of silently
 * skipping entries that lack `config.__eco`.
 */
export function assertEcoDeclaredComponent(
	component: unknown,
	context: { parentComponentFile?: string } = {},
): asserts component is EcoDeclaredComponent {
	if (isEcoDeclaredComponent(component)) {
		return;
	}

	throw new Error(getUndeclaredComponentDependencyMessage(context.parentComponentFile));
}
