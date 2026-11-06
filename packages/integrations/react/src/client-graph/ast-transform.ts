/**
 * AST transforms for the client graph boundary plugin.
 */

import { parseModuleSource } from '@ecopages/core/build';
import { analyzeReachability } from './reachability-analyzer.ts';
import { collectServerOnlyPageCode } from './ast-transform-eco-page.ts';
import { collectImportTransformEdits } from './ast-transform-walk-imports.ts';
import { walkAstNodes } from './ast-walk.ts';
import { planStrippedImportCleanup } from './ast-transform-stripped-imports.ts';
import { applySourceEdits } from './ast-transform-import-edits.ts';
import {
	mergeDeclaredModulesMap,
	mergeRequestedExportRules,
	normalizeRequestedExportsKey,
	parseDeclaredModules,
	resolveRequestedExportsKey,
	type RequestedExportRules,
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
 * Parses a module using Oxc AST and removes what must not reach the browser: forbidden imports,
 * named imports outside the declared rules, server-only Page options, and the top-level code the
 * browser module does not need that only removed code used or that uses a removed import.
 *
 * @remarks
 * Every edit is planned on the one parse of `source`, so error positions point into it. Throws
 * when code the browser module needs still references a binding whose import is removed.
 */
export function transformModuleImports(
	source: string,
	filename: string,
	globallyAllowed: Map<string, Set<string> | '*'>,
	requestedExports: Map<string, RequestedExportRules>,
	preserveUnreachableSideEffectImports = false,
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

	const strippedBindings = new Map<string, string>();
	const editedImports = new Set<unknown>();
	const importEdits = collectImportTransformEdits(program, {
		filename,
		reachability,
		allowedMap,
		preserveUnreachableSideEffectImports,
		strippedBindings,
		editedImports,
	});
	const pageCode = collectServerOnlyPageCode(program);
	const cleanupEdits = planStrippedImportCleanup({
		program,
		source,
		filename,
		strippedNodes: pageCode.strippedNodes,
		strippedBindings,
		editedImports,
		requestedExports: explicitRequestedExports,
	});

	const edits = [...importEdits, ...pageCode.edits, ...cleanupEdits];
	if (edits.length === 0) {
		return { transformed: source, modified: false };
	}
	return { transformed: applySourceEdits(source, edits), modified: true };
}
