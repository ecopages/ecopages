import { normalizeModuleDeclarations } from '../../eco/module-dependencies.ts';
import type { EcopagesVirtualImport } from '../../plugins/ecopages-virtual-imports.ts';
import { isContentServerVirtualModule } from '../../build/contracts/content-virtual-modules.ts';

/** One module a component's browser scripts import, with its named imports or none for the namespace. */
export type ModuleDeclaration = {
	from: string;
	imports?: string[];
};

/** Whether a browser script can import the `ecopages:` virtual module `specifier`. */
export function isBrowserEcopagesVirtualImport(specifier: string): boolean {
	return specifier.startsWith('ecopages:') && !isContentServerVirtualModule(specifier);
}

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
 * Lists the modules a component declares in `modules`, then the `ecopages:` virtual modules its module imports.
 *
 * @remarks A server-only `ecopages:` module is left out of both.
 */
export function declareModules(
	declaredModules: unknown,
	autoVirtualImports: readonly EcopagesVirtualImport[],
): ModuleDeclaration[] {
	return [
		...normalizeModuleDeclarations(getDeclaredModules(declaredModules)).filter(
			(declaration) =>
				!declaration.from.startsWith('ecopages:') || isBrowserEcopagesVirtualImport(declaration.from),
		),
		...autoVirtualImports.filter((declaration) => isBrowserEcopagesVirtualImport(declaration.from)),
	];
}
