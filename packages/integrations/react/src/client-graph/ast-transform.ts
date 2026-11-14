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
import type { ParseResult } from 'oxc-parser';
import {
	mergeDeclaredModulesMap,
	parseDeclaredModules,
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

/**
 * Parses a module using Oxc AST and removes what must not reach the browser: forbidden imports,
 * named imports outside the declared rules, server-only Page options, and the top-level code the
 * browser module does not need that only removed code used or that uses a removed import.
 *
 * @remarks
 * Every edit is planned on the one parse of `source`, so error positions point into it. Throws
 * when code the browser module needs still references a binding whose import is removed.
 *
 * @param requestedExports - The exports this module's importers use; `undefined` keeps every export.
 * @param parsed - The parse of `source`, when the caller already has it.
 */
export function transformModuleImports(
	source: string,
	filename: string,
	globallyAllowed: Map<string, Set<string> | '*'>,
	requestedExports: RequestedExportRules | undefined,
	parsed?: ParseResult['program'],
): { transformed: string; modified: boolean } {
	let program = parsed;
	if (!program) {
		try {
			program = parseModuleSource(filename, source).program;
		} catch {
			return { transformed: source, modified: false };
		}
	}

	const localDeclared = collectLocalDeclaredModules(program);
	const locallyAllowed = parseDeclaredModules(localDeclared);
	const allowedMap = mergeDeclaredModulesMap(globallyAllowed, locallyAllowed);
	const reachability = analyzeReachability(source, filename, program, requestedExports);

	const strippedBindings = new Map<string, string>();
	const editedImports = new Set<unknown>();
	const importEdits = collectImportTransformEdits(program, {
		filename,
		reachability,
		allowedMap,
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
		requestedExports,
	});

	const edits = [...importEdits, ...pageCode.edits, ...cleanupEdits];
	if (edits.length === 0) {
		return { transformed: source, modified: false };
	}
	return { transformed: applySourceEdits(source, edits), modified: true };
}
