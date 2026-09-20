import type { ParseResult } from 'oxc-parser';
import {
	getExportedName,
	isExplicitlyRequestedExport,
	type ExplicitlyRequestedExports,
} from './reachability-export-names.ts';

function pushFunctionOrClassExportRoot(
	exportNode: any,
	declaration: any,
	potentialClientRoots: unknown[],
	explicitlyRequestedExports: ExplicitlyRequestedExports,
): boolean {
	if (declaration?.type !== 'FunctionDeclaration' && declaration?.type !== 'ClassDeclaration') {
		return false;
	}
	const declarationName = declaration.id?.name;
	if (declarationName && isExplicitlyRequestedExport(declarationName, explicitlyRequestedExports)) {
		potentialClientRoots.push(exportNode);
	}
	return true;
}

function hasRequestedVariableExport(declaration: any, explicitlyRequestedExports: ExplicitlyRequestedExports): boolean {
	return declaration.declarations.some(
		(decl: any) =>
			decl.id?.type === 'Identifier' && isExplicitlyRequestedExport(decl.id.name, explicitlyRequestedExports),
	);
}

function hasRequestedExportSpecifier(exportNode: any, explicitlyRequestedExports: ExplicitlyRequestedExports): boolean {
	return (
		exportNode.specifiers?.some((specifier: any) => {
			const exportedName = getExportedName(specifier);
			return exportedName ? isExplicitlyRequestedExport(exportedName, explicitlyRequestedExports) : false;
		}) ?? false
	);
}

function pushExportNamedFallbackRoots(
	exportNode: any,
	potentialClientRoots: unknown[],
	explicitlyRequestedExports: ExplicitlyRequestedExports,
): void {
	if (exportNode.source && exportNode.specifiers?.length) {
		if (hasRequestedExportSpecifier(exportNode, explicitlyRequestedExports)) {
			potentialClientRoots.push(exportNode);
		}
		return;
	}

	const declaration = exportNode.declaration;
	if (pushFunctionOrClassExportRoot(exportNode, declaration, potentialClientRoots, explicitlyRequestedExports)) {
		return;
	}

	if (
		declaration?.type === 'VariableDeclaration' &&
		hasRequestedVariableExport(declaration, explicitlyRequestedExports)
	) {
		potentialClientRoots.push(exportNode);
		return;
	}

	if (hasRequestedExportSpecifier(exportNode, explicitlyRequestedExports)) {
		potentialClientRoots.push(exportNode);
	}
}

export function resolveFallbackClientRoots(
	program: ParseResult['program'],
	potentialClientRoots: unknown[],
	explicitlyRequestedExports?: ExplicitlyRequestedExports,
): boolean {
	if (potentialClientRoots.length > 0) {
		return false;
	}

	if (explicitlyRequestedExports) {
		for (const node of program.body) {
			if (node.type === 'ExportNamedDeclaration') {
				pushExportNamedFallbackRoots(node, potentialClientRoots, explicitlyRequestedExports);
			} else if (node.type === 'ExportDefaultDeclaration') {
				if (isExplicitlyRequestedExport('default', explicitlyRequestedExports)) {
					potentialClientRoots.push(node);
				}
			} else if (node.type === 'ExportAllDeclaration') {
				if (explicitlyRequestedExports === '*') {
					potentialClientRoots.push(node);
				}
			}
		}
		return false;
	}

	for (const node of program.body) {
		if (
			node.type === 'ExportNamedDeclaration' ||
			node.type === 'ExportDefaultDeclaration' ||
			node.type === 'ExportAllDeclaration'
		) {
			potentialClientRoots.push(node);
		}
	}
	return true;
}
