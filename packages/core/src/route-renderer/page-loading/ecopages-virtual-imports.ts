import { readFileSync } from 'node:fs';
import { parseSync } from 'oxc-parser';

export type EcopagesVirtualImport = {
	from: string;
	imports: string[] | undefined;
};

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
		result = parseSync(file, source, { sourceType: 'module' });
	} catch {
		return [];
	}

	const found = new Map<string, Set<string> | null>();

	for (const node of result.program.body ?? []) {
		if (node.type !== 'ImportDeclaration') continue;
		if (node.importKind === 'type') continue;
		const specifier: string = node.source?.value ?? '';
		if (!specifier.startsWith('ecopages:')) continue;

		if (found.get(specifier) === null) {
			continue;
		}

		const namedImports: string[] = [];
		for (const spec of node.specifiers ?? []) {
			if (spec.type === 'ImportSpecifier') {
				let importedName = spec.local?.name;
				if (spec.imported?.type === 'Identifier') {
					importedName = spec.imported.name;
				} else if (spec.imported?.type === 'Literal') {
					importedName = spec.imported.value;
				}
				namedImports.push(importedName);
			}
		}

		if (namedImports.length === 0) {
			found.set(specifier, null);
			continue;
		}

		const existing = found.get(specifier);
		if (!existing) {
			found.set(specifier, new Set(namedImports));
			continue;
		}

		for (const imported of namedImports) {
			existing.add(imported);
		}
	}

	return Array.from(found.entries()).map(([from, importsSet]) => ({
		from,
		imports: importsSet ? Array.from(importsSet) : undefined,
	}));
}
