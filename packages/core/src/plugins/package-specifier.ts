/**
 * Normalizes bare npm import specifiers to their package root.
 *
 * @example
 * toPackageRootSpecifier('@scope/pkg/sub/file') -> '@scope/pkg'
 * toPackageRootSpecifier('lodash/debounce') -> 'lodash'
 */
export function toPackageRootSpecifier(specifier: string): string {
	if (
		specifier.startsWith('.') ||
		specifier.startsWith('/') ||
		specifier.startsWith('node:') ||
		specifier.includes('://')
	) {
		return specifier;
	}

	if (specifier.startsWith('@')) {
		const [scope, name, ...rest] = specifier.split('/');
		if (!scope || !name) {
			return specifier;
		}

		return rest.length > 0 ? `${scope}/${name}` : specifier;
	}

	const [name] = specifier.split('/');
	return name ?? specifier;
}

/**
 * Returns true when `specifier` is a subpath import of `packageRoot`.
 */
export function isSubpathOfPackageRoot(specifier: string, packageRoot: string): boolean {
	if (specifier === packageRoot) {
		return false;
	}

	return specifier.startsWith(`${packageRoot}/`);
}
