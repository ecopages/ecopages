import { normalizeModuleDeclarations } from '../../eco/module-dependencies.ts';
import type { EcopagesVirtualImport } from './ecopages-virtual-imports.ts';

type ModuleDeclarationInput = {
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
function mergeModuleDeclaration(
	modulesMap: Map<string, Set<string> | null>,
	declaration: ModuleDeclarationInput,
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
 * Combines explicit config module declarations with auto-detected `ecopages:` imports.
 */
export function collectModuleDeclarations(
	modulesMap: Map<string, Set<string> | null>,
	declaredModules: unknown,
	autoVirtualImports: EcopagesVirtualImport[],
): void {
	for (const declaration of normalizeModuleDeclarations(getDeclaredModules(declaredModules))) {
		mergeModuleDeclaration(modulesMap, declaration);
	}

	for (const declaration of autoVirtualImports) {
		mergeModuleDeclaration(modulesMap, declaration);
	}
}