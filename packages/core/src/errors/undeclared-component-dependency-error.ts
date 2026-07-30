export function getUndeclaredComponentDependencyMessage(parentComponentFile?: string): string {
	const parentHint = parentComponentFile ? ` (declared by ${parentComponentFile})` : '';
	return `[ecopages] dependencies.components entries must be eco.component(), eco.layout(), or eco.html() components with component identity${parentHint}. Plain functions and untyped components are not valid dependency entries.`;
}

/**
 * Thrown when `dependencies.components` contains a plain function or component
 * without plugin-injected `config.identity` attribution.
 */
export class UndeclaredComponentDependencyError extends Error {
	override name = 'UndeclaredComponentDependencyError';

	/** Parent component file path when the invalid entry was declared. */
	readonly parentComponentFile?: string;

	constructor(parentComponentFile?: string) {
		super(getUndeclaredComponentDependencyMessage(parentComponentFile));
		this.parentComponentFile = parentComponentFile;
	}
}
