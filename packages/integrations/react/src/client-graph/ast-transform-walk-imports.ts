/**
 * AST walk that prunes forbidden imports and rewrites named import surfaces.
 */

import type { ReachabilityResult } from './reachability-analyzer.ts';
import { isServerOnlySpecifier, toModuleBaseSpecifier } from './specifier-classification.ts';
import { walkAstNodes } from './ast-walk.ts';
import { buildImportDeclarationRewrite, type SourceEdit } from './ast-transform-import-edits.ts';

export type ProcessSpecifierResult = { allowed: boolean; rules?: Set<string> | '*' };

export type WalkImportsContext = {
	filename: string;
	reachability: ReachabilityResult;
	edits: SourceEdit[];
	allowedMap: Map<string, Set<string> | '*'>;
};

function processSpecifier(specifier: string, allowedMap: Map<string, Set<string> | '*'>): ProcessSpecifierResult {
	const explicitRules = allowedMap.get(toModuleBaseSpecifier(specifier));
	if (isServerOnlySpecifier(specifier) && !explicitRules) {
		return { allowed: false };
	}

	return { allowed: true, rules: explicitRules ?? '*' };
}

function pruneForbiddenSpecifier(
	node: { start: number; end: number },
	ctx: WalkImportsContext,
	specifier: string,
	message: string,
	replacement: string,
): void {
	const reachableRules = ctx.reachability.reachableImports.get(specifier);
	if (reachableRules && !ctx.reachability.isFallbackRoots) {
		throw new Error(
			`[Ecopages Client Reachability] ${message} at ${ctx.filename}:${node.start}. This import is explicitly reachable from the React render function.`,
		);
	}
	ctx.edits.push({ start: node.start, end: node.end, replacement });
}

function handleImportDeclaration(node: any, ctx: WalkImportsContext): boolean {
	const specifier = node.source.value as string;
	const reachableRules = ctx.reachability.reachableImports.get(specifier);
	const { allowed, rules } = processSpecifier(specifier, ctx.allowedMap);

	if (!allowed) {
		pruneForbiddenSpecifier(node, ctx, specifier, `Forbidden client import '${specifier}'`, '');
		return true;
	}

	if (rules instanceof Set && node.specifiers && node.specifiers.length > 0) {
		const rewrite = buildImportDeclarationRewrite(node, specifier, rules);
		if (rewrite) {
			ctx.edits.push(rewrite);
		}
		return true;
	}

	if (!reachableRules && (!node.specifiers || node.specifiers.length === 0)) {
		ctx.edits.push({ start: node.start, end: node.end, replacement: '' });
	}

	return true;
}

function handleExportNamedDeclaration(node: any, ctx: WalkImportsContext): boolean {
	const specifier = node.source.value as string;
	const { allowed } = processSpecifier(specifier, ctx.allowedMap);
	if (!allowed) {
		pruneForbiddenSpecifier(node, ctx, specifier, `Forbidden client export from '${specifier}'`, '');
	}
	return true;
}

function handleExportAllDeclaration(node: any, ctx: WalkImportsContext): boolean {
	const specifier = node.source.value as string;
	const { allowed } = processSpecifier(specifier, ctx.allowedMap);
	if (!allowed) {
		pruneForbiddenSpecifier(node, ctx, specifier, `Forbidden client export * from '${specifier}'`, '');
	}
	return true;
}

function handleImportExpression(node: any, ctx: WalkImportsContext): boolean {
	if (!node.source?.value) return false;

	const specifier = node.source.value as string;
	const { allowed } = processSpecifier(specifier, ctx.allowedMap);
	if (!allowed) {
		pruneForbiddenSpecifier(
			node,
			ctx,
			specifier,
			`Forbidden dynamic import('${specifier}')`,
			'Promise.resolve({})',
		);
	}
	return true;
}

function handleRequireCall(node: any, ctx: WalkImportsContext): void {
	const arg = node.arguments?.[0];
	if (!arg || (arg.type !== 'StringLiteral' && arg.type !== 'Literal') || typeof arg.value !== 'string') {
		return;
	}

	const specifier = arg.value;
	const { allowed } = processSpecifier(specifier, ctx.allowedMap);
	if (!allowed) {
		pruneForbiddenSpecifier(node, ctx, specifier, `Forbidden require('${specifier}')`, '({})');
	}
}

/**
 * Walks a parsed program and collects import-pruning edits.
 */
export function collectImportTransformEdits(program: any, ctx: Omit<WalkImportsContext, 'edits'>): SourceEdit[] {
	const edits: SourceEdit[] = [];
	const fullCtx: WalkImportsContext = { ...ctx, edits };

	walkAstNodes(program, (node) => {
		if (node.type === 'ImportDeclaration') {
			return handleImportDeclaration(node, fullCtx);
		}

		if (node.type === 'ExportNamedDeclaration' && node.source) {
			return handleExportNamedDeclaration(node, fullCtx);
		}

		if (node.type === 'ExportAllDeclaration' && node.source) {
			return handleExportAllDeclaration(node, fullCtx);
		}

		if (node.type === 'ImportExpression') {
			return handleImportExpression(node, fullCtx);
		}

		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
			handleRequireCall(node, fullCtx);
		}

		return false;
	});

	return edits;
}
