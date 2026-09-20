import {
	getExportedName,
	getLocalExportName,
	getReexportedImportName,
	isExplicitlyRequestedExport,
	type ExplicitlyRequestedExports,
} from './reachability-export-names.ts';
import type { TopLevelImportEntry } from './reachability-top-level-index.ts';

export type ReachabilityTraversalResult = {
	reachableImports: Map<string, Set<string> | '*'>;
	reachableDeclarations: Set<unknown>;
};

type TraversalContext = {
	reachableImports: Map<string, Set<string> | '*'>;
	reachableDeclarations: Set<unknown>;
	queue: unknown[];
	visitedNodes: Set<unknown>;
	checkIdentifier: (name: string) => void;
	explicitlyRequestedExports?: ExplicitlyRequestedExports;
};

/**
 * Returns `true` when the visitor already walked the children that matter
 * and default object-key descent should be skipped.
 */
type NodeVisitor = (node: any, ctx: TraversalContext, localScope: Set<string>) => boolean;

function markImportReachable(
	reachableImports: Map<string, Set<string> | '*'>,
	specifier: string,
	importedName: string,
): void {
	let current = reachableImports.get(specifier);
	if (current === '*') return;

	if (importedName === '*') {
		reachableImports.set(specifier, '*');
		return;
	}

	if (!current) {
		current = new Set<string>();
		reachableImports.set(specifier, current);
	}
	current.add(importedName);
}

function createTraversalContext(
	topLevelImports: TopLevelImportEntry[],
	topLevelDeclarations: Map<string, unknown>,
	explicitlyRequestedExports?: ExplicitlyRequestedExports,
): TraversalContext {
	const reachableImports = new Map<string, Set<string> | '*'>();
	const reachableDeclarations = new Set<unknown>();
	const queue: unknown[] = [];
	const visitedNodes = new Set<unknown>();

	function checkIdentifier(name: string): void {
		if (topLevelDeclarations.has(name)) {
			const declNode = topLevelDeclarations.get(name);
			if (!reachableDeclarations.has(declNode)) {
				reachableDeclarations.add(declNode);
				queue.push(declNode);
			}
		}

		for (const imp of topLevelImports) {
			if (imp.bindings.has(name)) {
				markImportReachable(reachableImports, imp.specifier, imp.bindings.get(name)!);
			}
		}
	}

	return {
		reachableImports,
		reachableDeclarations,
		queue,
		visitedNodes,
		checkIdentifier,
		explicitlyRequestedExports,
	};
}

function visitExportAll(node: any, ctx: TraversalContext): boolean {
	if (typeof node.source?.value !== 'string') return false;
	markImportReachable(ctx.reachableImports, node.source.value as string, '*');
	return true;
}

function visitExportNamed(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	if (typeof node.source?.value === 'string') {
		for (const specifier of node.specifiers ?? []) {
			const importedName = getReexportedImportName(specifier);
			if (importedName) {
				markImportReachable(ctx.reachableImports, node.source.value as string, importedName);
			}
		}
		return true;
	}

	if (node.source || !ctx.explicitlyRequestedExports || !node.specifiers?.length) {
		return false;
	}

	for (const specifier of node.specifiers) {
		const exportedName = getExportedName(specifier);
		if (!exportedName || !isExplicitlyRequestedExport(exportedName, ctx.explicitlyRequestedExports)) {
			continue;
		}

		const localName = getLocalExportName(specifier);
		if (localName && !localScope.has(localName)) {
			ctx.checkIdentifier(localName);
		}
	}
	return true;
}

function visitIdentifier(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	if (!localScope.has(node.name)) {
		ctx.checkIdentifier(node.name);
	}
	return false;
}

function visitJsxIdentifier(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	if (/^[A-Z]/.test(node.name) && !localScope.has(node.name)) {
		ctx.checkIdentifier(node.name);
	}
	return false;
}

function visitMemberExpression(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	traverseNode(node.object, ctx, localScope);
	if (node.computed) {
		traverseNode(node.property, ctx, localScope);
	}
	return true;
}

function visitProperty(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	if (node.computed) traverseNode(node.key, ctx, localScope);
	traverseNode(node.value, ctx, localScope);
	return true;
}

function visitJsxElement(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	traverseNode(node.name, ctx, localScope);
	if (node.attributes) {
		for (const attr of node.attributes) traverseNode(attr, ctx, localScope);
	}
	return true;
}

function visitJsxMemberExpression(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	traverseNode(node.object, ctx, localScope);
	return true;
}

function visitCallExpression(node: any, ctx: TraversalContext): boolean {
	if (node.callee?.type !== 'Identifier') {
		return false;
	}

	if (node.callee.name === 'dynamic') {
		const arg = node.arguments[0];
		if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) {
			const body = arg.body;
			if (body.type === 'ImportExpression' && body.source.type === 'Literal') {
				markImportReachable(ctx.reachableImports, body.source.value as string, '*');
			}
		}
		return false;
	}

	if (node.callee.name === 'require') {
		const arg = node.arguments?.[0];
		if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal') && typeof arg.value === 'string') {
			markImportReachable(ctx.reachableImports, arg.value, '*');
		}
	}

	return false;
}

function visitImportExpression(node: any, ctx: TraversalContext): boolean {
	if (node.source.type === 'Literal') {
		markImportReachable(ctx.reachableImports, node.source.value as string, '*');
	}
	return false;
}

function visitFunctionNode(node: any, ctx: TraversalContext, localScope: Set<string>): boolean {
	const newScope = new Set(localScope);
	if (node.id?.type === 'Identifier') newScope.add(node.id.name);
	if (node.params?.items) {
		for (const p of node.params.items) {
			if (p.pattern?.type === 'Identifier') {
				newScope.add(p.pattern.name);
			}
		}
	}
	traverseNode(node.body, ctx, newScope);
	return true;
}

const NODE_VISITORS = new Map<string, NodeVisitor>([
	['ExportAllDeclaration', visitExportAll],
	['ExportNamedDeclaration', visitExportNamed],
	['Identifier', visitIdentifier],
	['JSXIdentifier', visitJsxIdentifier],
	['MemberExpression', visitMemberExpression],
	['Property', visitProperty],
	['JSXOpeningElement', visitJsxElement],
	['JSXClosingElement', visitJsxElement],
	['JSXMemberExpression', visitJsxMemberExpression],
	['CallExpression', visitCallExpression],
	['ImportExpression', visitImportExpression],
	['ArrowFunctionExpression', visitFunctionNode],
	['FunctionExpression', visitFunctionNode],
	['FunctionDeclaration', visitFunctionNode],
]);

function traverseNode(node: any, ctx: TraversalContext, localScope: Set<string>): void {
	if (!node || typeof node !== 'object') return;
	if (ctx.visitedNodes.has(node)) return;
	ctx.visitedNodes.add(node);

	if (Array.isArray(node)) {
		for (const child of node) traverseNode(child, ctx, localScope);
		return;
	}

	const visitor = NODE_VISITORS.get(node.type);
	if (visitor?.(node, ctx, localScope)) return;

	for (const key in node) {
		if (key !== 'type' && key !== 'start' && key !== 'end') {
			traverseNode(node[key], ctx, localScope);
		}
	}
}

export function runReachabilityTraversal(
	roots: unknown[],
	topLevelImports: TopLevelImportEntry[],
	topLevelDeclarations: Map<string, unknown>,
	explicitlyRequestedExports?: ExplicitlyRequestedExports,
): ReachabilityTraversalResult {
	const ctx = createTraversalContext(topLevelImports, topLevelDeclarations, explicitlyRequestedExports);
	ctx.queue.push(...roots);

	while (ctx.queue.length > 0) {
		const root = ctx.queue.shift();
		traverseNode(root, ctx, new Set());
	}

	return {
		reachableImports: ctx.reachableImports,
		reachableDeclarations: ctx.reachableDeclarations,
	};
}
