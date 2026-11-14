import { normalizeModuleDeclarations } from '../../eco/module-dependencies.ts';
import { isBrowserEcopagesVirtualImport } from './ecopages-virtual-imports.ts';
import type { EcopagesVirtualImport } from './ecopages-virtual-imports.ts';

/** One module a component's browser scripts import, with its named imports or none for the namespace. */
export type ModuleDeclaration = {
	from: string;
	imports?: string[];
};

/**
 * Narrows arbitrary config input onto the declared module string array shape.
 */
function getDeclaredModules(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}

	return value.every((entry) => typeof entry === 'string') ? value : undefined;
}

/**
 * Merges one module declaration into the aggregated map, preserving the wildcard
 * import semantics represented by `null`.
 */
export function mergeModuleDeclaration(
	modulesMap: Map<string, Set<string> | null>,
	declaration: ModuleDeclaration,
): void {
	const existing = modulesMap.get(declaration.from);
	if (!declaration.imports || declaration.imports.length === 0) {
		modulesMap.set(declaration.from, null);
		return;
	}

	if (existing === null) {
		return;
	}

	const merged = existing ?? new Set<string>();
	for (const imported of declaration.imports) {
		merged.add(imported);
	}
	modulesMap.set(declaration.from, merged);
}

/**
 * Lists the modules a component declares in `modules`, then the `ecopages:` virtual modules its source imports.
 *
 * @remarks A server-only `ecopages:` module declared in `modules` is left out.
 */
export function declareModules(
	declaredModules: unknown,
	autoVirtualImports: EcopagesVirtualImport[],
): ModuleDeclaration[] {
	return [
		...normalizeModuleDeclarations(getDeclaredModules(declaredModules)).filter(
			(declaration) =>
				!declaration.from.startsWith('ecopages:') || isBrowserEcopagesVirtualImport(declaration.from),
		),
		...autoVirtualImports,
	];
}
