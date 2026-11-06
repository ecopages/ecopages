import {
	getExportedName,
	getLocalExportName,
	getReexportedImportName,
	isExplicitlyRequestedExport,
	type ExplicitlyRequestedExports,
} from './reachability-export-names.ts';
import type { TopLevelImportEntry } from './reachability-top-level-index.ts';
import { walkScopedReferences } from './scope-walk.ts';

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

function visitExportNamed(node: any, ctx: TraversalContext): boolean {
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
		if (localName) ctx.checkIdentifier(localName);
	}
	return true;
}

function visitCallExpression(node: any, ctx: TraversalContext): void {
	if (node.callee?.type !== 'Identifier') return;

	if (node.callee.name === 'dynamic') {
		const arg = node.arguments[0];
		if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) {
			const body = arg.body;
			if (body.type === 'ImportExpression' && body.source.type === 'Literal') {
				markImportReachable(ctx.reachableImports, body.source.value as string, '*');
			}
		}
		return;
	}

	if (node.callee.name === 'require') {
		const arg = node.arguments?.[0];
		if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal') && typeof arg.value === 'string') {
			markImportReachable(ctx.reachableImports, arg.value, '*');
		}
	}
}

/**
 * Records the import edges a node creates without naming a binding.
 *
 * @returns `true` when the node needs no further walk.
 */
function visitImportEdges(node: any, ctx: TraversalContext): boolean {
	if (ctx.visitedNodes.has(node)) return true;
	ctx.visitedNodes.add(node);

	switch (node.type) {
		case 'ExportAllDeclaration':
			if (typeof node.source?.value !== 'string') return false;
			markImportReachable(ctx.reachableImports, node.source.value as string, '*');
			return true;
		case 'ExportNamedDeclaration':
			return visitExportNamed(node, ctx);
		case 'CallExpression':
			visitCallExpression(node, ctx);
			return false;
		case 'ImportExpression':
			if (node.source.type === 'Literal') {
				markImportReachable(ctx.reachableImports, node.source.value as string, '*');
			}
			return false;
	}
	return false;
}

export function runReachabilityTraversal(
	roots: unknown[],
	topLevelImports: TopLevelImportEntry[],
	topLevelDeclarations: Map<string, unknown>,
	explicitlyRequestedExports?: ExplicitlyRequestedExports,
): ReachabilityTraversalResult {
	const ctx = createTraversalContext(topLevelImports, topLevelDeclarations, explicitlyRequestedExports);
	ctx.queue.push(...roots);

	const visitor = {
		onReference: (name: string) => ctx.checkIdentifier(name),
		onNode: (node: any) => visitImportEdges(node, ctx),
	};
	while (ctx.queue.length > 0) {
		walkScopedReferences(ctx.queue.shift(), visitor);
	}

	return {
		reachableImports: ctx.reachableImports,
		reachableDeclarations: ctx.reachableDeclarations,
	};
}
