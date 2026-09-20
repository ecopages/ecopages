import { readFileSync } from 'node:fs';
import { isContentServerVirtualModule } from '../../build/contracts/content-virtual-modules.ts';
import { parseModuleSource } from '../../cache/module-parse-cache.ts';

export type EcopagesVirtualImport = {
	from: string;
	imports: string[] | undefined;
};

export function isBrowserEcopagesVirtualImport(specifier: string): boolean {
	return specifier.startsWith('ecopages:') && !isContentServerVirtualModule(specifier);
}

type ImportSpecifierNode = {
	type?: string;
	local?: { name?: string };
	imported?: { type?: string; name?: string; value?: string };
};

function getNamedImportFromSpecifier(spec: ImportSpecifierNode): string | undefined {
	if (spec.type !== 'ImportSpecifier') {
		return undefined;
	}

	let importedName = spec.local?.name;
	if (spec.imported?.type === 'Identifier') {
		importedName = spec.imported.name;
	} else if (spec.imported?.type === 'Literal') {
		importedName = spec.imported.value;
	}

	return importedName;
}

function collectNamedImportsFromDeclaration(node: { specifiers?: ImportSpecifierNode[] }): string[] {
	const namedImports: string[] = [];
	for (const spec of node.specifiers ?? []) {
		const importedName = getNamedImportFromSpecifier(spec);
		if (importedName) {
			namedImports.push(importedName);
		}
	}
	return namedImports;
}

function recordVirtualImport(found: Map<string, Set<string> | null>, specifier: string, namedImports: string[]): void {
	if (found.get(specifier) === null) {
		return;
	}

	if (namedImports.length === 0) {
		found.set(specifier, null);
		return;
	}

	const existing = found.get(specifier);
	if (!existing) {
		found.set(specifier, new Set(namedImports));
		return;
	}

	for (const imported of namedImports) {
		existing.add(imported);
	}
}

/**
 * Extracts runtime `ecopages:` virtual-module imports from a component source file.
 *
 * Type-only imports are skipped and bare namespace imports are represented by an
 * `undefined` import list so downstream module generation can preserve that shape.
 */
export function extractEcopagesVirtualImports(file: string): EcopagesVirtualImport[] {
	let source: string;
	try {
		source = readFileSync(file, 'utf-8');
	} catch {
		return [];
	}

	let result;
	try {
		result = parseModuleSource(file, source);
	} catch {
		return [];
	}

	const found = new Map<string, Set<string> | null>();

	for (const node of result.program.body ?? []) {
		if (node.type !== 'ImportDeclaration') continue;
		if (node.importKind === 'type') continue;
		const specifier: string = node.source?.value ?? '';
		if (!isBrowserEcopagesVirtualImport(specifier)) continue;

		recordVirtualImport(found, specifier, collectNamedImportsFromDeclaration(node));
	}

	return Array.from(found.entries()).map(([from, importsSet]) => ({
		from,
		imports: importsSet ? Array.from(importsSet) : undefined,
	}));
}
