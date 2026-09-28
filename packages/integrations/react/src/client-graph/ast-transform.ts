/**
 * AST transforms for the client graph boundary plugin.
 */

import { parseModuleSource } from '@ecopages/core/cache';
import type { RequestedExportRules } from './boundary-cache.ts';
import { analyzeReachability } from './reachability-analyzer.ts';
import { stripServerOnlyEcoPageOptions } from './ast-transform-eco-page.ts';
import { collectImportTransformEdits } from './ast-transform-walk-imports.ts';
import { walkAstNodes } from './ast-walk.ts';
import { applySourceEdits } from './ast-transform-import-edits.ts';
import {
	mergeDeclaredModulesMap,
	mergeRequestedExportRules,
	normalizeRequestedExportsKey,
	parseDeclaredModules,
	resolveRequestedExportsKey,
} from './specifier-classification.ts';

function collectLocalDeclaredModules(program: any): string[] {
	const localDeclared: string[] = [];

	walkAstNodes(program, (node) => {
		if (node.type === 'Property' && node.key?.name === 'modules' && node.value?.type === 'ArrayExpression') {
			for (const el of node.value.elements) {
				if ((el.type === 'StringLiteral' || el.type === 'Literal') && typeof el.value === 'string') {
					localDeclared.push(el.value);
				}
			}
		}
	});

	return localDeclared;
}

function getImportedOrReexportedSource(statement: any): string | undefined {
	if (statement.type === 'ImportDeclaration') {
		return statement.source.value as string;
	}

	if (
		(statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportAllDeclaration') &&
		statement.source
	) {
		return statement.source.value as string;
	}

	return undefined;
}

function propagateRequestedExportRules(
	program: any,
	filename: string,
	reachability: ReturnType<typeof analyzeReachability>,
	requestedExports: Map<string, RequestedExportRules>,
): void {
	for (const statement of program.body) {
		const source = getImportedOrReexportedSource(statement);
		if (!source) continue;

		const reachableRules = reachability.reachableImports.get(source);
		const requestedModuleKey = resolveRequestedExportsKey(filename, source);
		if (!requestedModuleKey || !reachableRules) continue;

		mergeRequestedExportRules(requestedExports, requestedModuleKey, reachableRules);
	}
}

/**
 * Parses a module using Oxc AST and surgically removes forbidden imports.
 * Filters down to the exact specifiers requested via `{namedImport}` syntax.
 */
export function transformModuleImports(
	source: string,
	filename: string,
	globallyAllowed: Map<string, Set<string> | '*'>,
	requestedExports: Map<string, RequestedExportRules>,
	stripServerOnlyPageOptions = false,
): { transformed: string; modified: boolean } {
	let result;
	try {
		result = parseModuleSource(filename, source);
	} catch {
		return { transformed: source, modified: false };
	}

	const { program } = result;
	const localDeclared = collectLocalDeclaredModules(program);
	const locallyAllowed = parseDeclaredModules(localDeclared);
	const allowedMap = mergeDeclaredModulesMap(globallyAllowed, locallyAllowed);
	const explicitRequestedExports = requestedExports.get(normalizeRequestedExportsKey(filename));
	const reachability = analyzeReachability(source, filename, program, explicitRequestedExports);

	propagateRequestedExportRules(program, filename, reachability, requestedExports);

	const edits = collectImportTransformEdits(program, {
		filename,
		reachability,
		allowedMap,
	});

	if (edits.length === 0) {
		return stripServerOnlyPageOptions
			? stripServerOnlyEcoPageOptions(source, program)
			: { transformed: source, modified: false };
	}

	const transformed = applySourceEdits(source, edits);

	let reparsedResult;
	try {
		reparsedResult = parseModuleSource(filename, transformed);
	} catch {
		return { transformed, modified: true };
	}

	const strippedPageOptions = stripServerOnlyPageOptions
		? stripServerOnlyEcoPageOptions(transformed, reparsedResult.program)
		: { transformed, modified: false };
	if (strippedPageOptions.modified) {
		return strippedPageOptions;
	}

	return { transformed, modified: true };
}
