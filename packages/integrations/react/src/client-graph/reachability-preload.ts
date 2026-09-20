import { parseModuleSource } from '@ecopages/core/cache';
import type { ExportNamedDeclaration } from 'oxc-parser';

export function isPreloadExportStatement(statement: ExportNamedDeclaration): boolean {
	const declaration = statement.declaration;
	if (declaration?.type === 'FunctionDeclaration' || declaration?.type === 'ClassDeclaration') {
		return declaration.id?.type === 'Identifier' && declaration.id.name === 'preload';
	}

	if (declaration?.type === 'VariableDeclaration') {
		return (
			declaration.declarations?.some(
				(declarator) => declarator.id.type === 'Identifier' && declarator.id.name === 'preload',
			) ?? false
		);
	}

	return statement.specifiers.some((specifier) => {
		const exported = specifier.exported;
		return exported.type === 'Identifier' ? exported.name === 'preload' : exported.value === 'preload';
	});
}

/**
 * Returns whether a module exports a named `preload` binding.
 *
 * @remarks
 * Hydration entries only wire `preload` when this is true, so Pages without
 * that export do not produce a missing-named-import warning.
 */
export function hasPagePreloadExport(source: string, filename: string): boolean {
	try {
		const { program } = parseModuleSource(filename, source);
		return program.body.some(
			(statement) => statement.type === 'ExportNamedDeclaration' && isPreloadExportStatement(statement),
		);
	} catch {
		return false;
	}
}
