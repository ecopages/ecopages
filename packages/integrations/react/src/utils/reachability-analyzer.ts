/**
 * @module ReachabilityAnalyzer
 *
 * This module is responsible for performing static analysis on Ecopages client components
 * using the Oxc AST parser. It computes a strict "reachability graph" of all JavaScript/TypeScript
 * dependencies (imports, variables, functions, and classes) that begin from explicit client roots.
 *
 * In Ecopages, "client roots" are defined as the `render`, `errorBoundary`, or `loadingFallback`
 * properties passed into `eco.page()` or `eco.component()`. By tracing the execution path from
 * these roots, the analyzer determines exactly which modules and bindings are actually needed
 * by the browser to hydrate the page, and which imports are unused on the client (and thus can be pruned).
 */

import { parseSync } from 'oxc-parser';
import { extname } from 'node:path';

type ParserLanguage = 'js' | 'jsx' | 'ts' | 'tsx';

/**
 * Determines the appropriate parser language configuration for a given file name.
 *
 * @param filename - The absolute or relative path to the file.
 * @returns The Oxc parser language dialect to use ('js', 'jsx', 'ts', or 'tsx').
 */
export function parserLanguageForFile(filename: string): ParserLanguage {
	const extension = extname(filename).toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

/**
 * Represents the computed results of a reachability analysis pass.
 */
export type ReachabilityResult = {
	/**
	 * Map from import specifier (e.g. 'node:fs', '@/components/Button')
	 * to a Set of imported bindings, or '*' for namespace imports.
	 */
	reachableImports: Map<string, Set<string> | '*'>;

	/**
	 * AST nodes of top-level declarations that are reachable.
	 */
	reachableDeclarations: Set<unknown>;

	unreachableSideEffectImports: unknown[];

	/**
	 * Indicates whether the file had explicit eco client roots, or fell back to treating all exports as roots.
	 */
	isFallbackRoots: boolean;

	/**
	 * Whether the file was successfully parsed and analyzed.
	 */
	analyzed: boolean;
};

/**
 * Analyzes a module using Oxc AST and extracts a strict reachability graph
 * starting from client roots (`render`, `errorBoundary`, `loadingFallback` of `eco.page` or `eco.component`).
 */
export function analyzeReachability(source: string, filename: string): ReachabilityResult {
	let result;
	try {
		result = parseSync(filename, source, {
			sourceType: 'module',
			lang: parserLanguageForFile(filename),
		});
	} catch {
		return {
			reachableImports: new Map(),
			reachableDeclarations: new Set(),
			unreachableSideEffectImports: [],
			isFallbackRoots: true,
			analyzed: false,
		};
	}

	const { program } = result;

	const topLevelImports: {
		node: unknown;
		specifier: string;
		bindings: Map<string, string>;
		isSideEffect: boolean;
	}[] = [];
	const topLevelDeclarations: Map<string, unknown> = new Map();
	const potentialClientRoots: unknown[] = [];

	for (const statement of program.body) {
		if (statement.type === 'ImportDeclaration') {
			const specifier = statement.source.value as string;
			const bindings = new Map<string, string>();

			if (!statement.specifiers || statement.specifiers.length === 0) {
				topLevelImports.push({ node: statement, specifier, bindings, isSideEffect: true });
			} else {
				for (const spec of statement.specifiers) {
					if (spec.type === 'ImportDefaultSpecifier') {
						bindings.set(spec.local.name, 'default');
					} else if (spec.type === 'ImportNamespaceSpecifier') {
						bindings.set(spec.local.name, '*');
					} else if (spec.type === 'ImportSpecifier') {
						const importedName =
							spec.imported.type === 'Identifier' ? spec.imported.name : (spec.imported as any).value;
						bindings.set(spec.local.name, importedName);
					}
				}
				topLevelImports.push({ node: statement, specifier, bindings, isSideEffect: false });
			}
		} else if (statement.type === 'VariableDeclaration') {
			for (const decl of statement.declarations) {
				if (decl.id.type === 'Identifier') {
					topLevelDeclarations.set(decl.id.name, statement);
					checkPotentialClientRoot(decl.init);
				}
			}
		} else if (statement.type === 'FunctionDeclaration' || statement.type === 'ClassDeclaration') {
			if (statement.id && statement.id.type === 'Identifier') {
				topLevelDeclarations.set(statement.id.name, statement);
			}
		} else if (statement.type === 'ExportNamedDeclaration') {
			if (statement.declaration) {
				const decl = statement.declaration;
				if (decl.type === 'FunctionDeclaration' || decl.type === 'ClassDeclaration') {
					if (decl.id && decl.id.type === 'Identifier') {
						topLevelDeclarations.set(decl.id.name, statement);
					}
				} else if (decl.type === 'VariableDeclaration') {
					for (const v of decl.declarations) {
						if (v.id.type === 'Identifier') {
							topLevelDeclarations.set(v.id.name, statement);
							checkPotentialClientRoot(v.init);
						}
					}
				}
			}
		} else if (statement.type === 'ExportDefaultDeclaration') {
			checkPotentialClientRoot(statement.declaration);
		} else if (statement.type === 'ExpressionStatement') {
			checkPotentialClientRoot(statement.expression);
		}
	}

	/**
	 * Inspects a node to determine if it represents an Ecopages client root declaration.
	 *
	 * @param node - The AST node to inspect.
	 */
	function checkPotentialClientRoot(node: unknown) {
		if (!node || typeof node !== 'object') return;
		if (
			(node as { type: string }).type === 'CallExpression' &&
			(node as { callee: { type: string } }).callee.type === 'MemberExpression'
		) {
			const obj = (node as { callee: { object: unknown } }).callee.object;
			const prop = (node as { callee: { property: unknown } }).callee.property;
			if (
				(obj as { type: string }).type === 'Identifier' &&
				(obj as { name: string }).name === 'eco' &&
				(prop as { type: string }).type === 'Identifier' &&
				((prop as { name: string }).name === 'page' || (prop as { name: string }).name === 'component')
			) {
				potentialClientRoots.push((node as { callee: unknown }).callee);

				const arg = (node as { arguments: unknown[] }).arguments[0];
				if (arg && (arg as { type: string }).type === 'ObjectExpression') {
					for (const prop of (arg as { properties: unknown[] }).properties) {
						if (
							(prop as { type: string }).type === 'Property' &&
							(prop as { key: { type: string } }).key.type === 'Identifier'
						) {
							if (
								[
									'render',
									'errorBoundary',
									'loadingFallback',
									'clientScripts',
									'dependencies',
								].includes((prop as { key: { name: string } }).key.name)
							) {
								potentialClientRoots.push((prop as { value: unknown }).value);
							}
						}
					}
				}
			}
		} else if (
			(node as { type: string }).type === 'CallExpression' &&
			(node as { callee: { type: string } }).callee.type === 'Identifier' &&
			(node as { callee: { name: string } }).callee.name === 'dynamic'
		) {
			potentialClientRoots.push(node);
		}
	}

	let isFallbackRoots = false;
	if (potentialClientRoots.length === 0) {
		isFallbackRoots = true;
		for (const node of program.body) {
			if (
				(node as { type: string }).type === 'ExportNamedDeclaration' ||
				(node as { type: string }).type === 'ExportDefaultDeclaration' ||
				(node as { type: string }).type === 'ExportAllDeclaration'
			) {
				potentialClientRoots.push(node);
			}
		}
	}

	const reachableImports = new Map<string, Set<string> | '*'>();
	const reachableDeclarations = new Set<unknown>();
	const queue: unknown[] = [...potentialClientRoots];
	const visitedNodes = new Set<unknown>();

	/**
	 * Registers an imported binding as reachable in the client graph.
	 *
	 * @param specifier - The module specifier from which the binding is imported.
	 * @param importedName - The specific named export being imported, or '*' for namespace imports.
	 */
	function markImportReachable(specifier: string, importedName: string) {
		let current = reachableImports.get(specifier);
		if (current === '*') return;

		if (importedName === '*') {
			reachableImports.set(specifier, '*');
		} else {
			if (!current) {
				current = new Set<string>();
				reachableImports.set(specifier, current);
			}
			current.add(importedName);
		}
	}

	/**
	 * Traces an identifier to its origin declaration, enqueuing it for deep traversal if it resolves
	 * to a local module-level declaration, or marking it as a reachable import if it originates from another module.
	 *
	 * @param name - The identifier name to check.
	 */
	function checkIdentifier(name: string) {
		if (topLevelDeclarations.has(name)) {
			const declNode = topLevelDeclarations.get(name);
			if (!reachableDeclarations.has(declNode)) {
				reachableDeclarations.add(declNode);
				queue.push(declNode);
			}
		}

		for (const imp of topLevelImports) {
			if (imp.bindings.has(name)) {
				markImportReachable(imp.specifier, imp.bindings.get(name)!);
			}
		}
	}

	/**
	 * Recursively walks down an AST node to discover referenced variables and function calls,
	 * building out the reachability graph.
	 *
	 * @param node - The Oxc AST node to traverse. Typed as `any` because Oxc lacks a unified iterable node type.
	 * @param localScope - A set of identifiers that shadow module-level declarations within the current lexical scope.
	 */
	function traverse(node: any, localScope: Set<string>) {
		if (!node || typeof node !== 'object') return;
		if (visitedNodes.has(node)) return;
		visitedNodes.add(node);

		if (Array.isArray(node)) {
			for (const child of node) traverse(child, localScope);
			return;
		}

		const currentScope = localScope;

		if (node.type === 'Identifier' || (node.type === 'JSXIdentifier' && /^[A-Z]/.test(node.name))) {
			if (!currentScope.has(node.name)) {
				checkIdentifier(node.name);
			}
		} else if (node.type === 'MemberExpression') {
			traverse(node.object, currentScope);
			if (node.computed) {
				traverse(node.property, currentScope);
			}
			return;
		} else if (node.type === 'Property') {
			if (node.computed) traverse(node.key, currentScope);
			traverse(node.value, currentScope);
			return;
		} else if (node.type === 'JSXOpeningElement' || node.type === 'JSXClosingElement') {
			traverse(node.name, currentScope);
			if (node.attributes) {
				for (const attr of node.attributes) traverse(attr, currentScope);
			}
			return;
		} else if (node.type === 'JSXIdentifier') {
			if (/^[A-Z]/.test(node.name) && !currentScope.has(node.name)) {
				checkIdentifier(node.name);
			}
		} else if (node.type === 'JSXMemberExpression') {
			traverse(node.object, currentScope);
			return;
		} else if (
			node.type === 'CallExpression' &&
			node.callee.type === 'Identifier' &&
			node.callee.name === 'dynamic'
		) {
			const arg = node.arguments[0];
			if (arg && (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression')) {
				const body = arg.body;
				if (body.type === 'ImportExpression' && body.source.type === 'Literal') {
					markImportReachable(body.source.value as string, '*');
				}
			}
		} else if (node.type === 'ImportExpression' && node.source.type === 'Literal') {
			markImportReachable(node.source.value as string, '*');
		}

		if (
			node.type === 'ArrowFunctionExpression' ||
			node.type === 'FunctionExpression' ||
			node.type === 'FunctionDeclaration'
		) {
			const newScope = new Set(currentScope);
			if (node.id && node.id.type === 'Identifier') newScope.add(node.id.name);
			if (node.params && node.params.items) {
				for (const p of node.params.items) {
					if (p.pattern && p.pattern.type === 'Identifier') {
						newScope.add(p.pattern.name);
					}
				}
			}
			traverse(node.body, newScope);
			return;
		}

		for (const key in node) {
			if (key !== 'type' && key !== 'start' && key !== 'end') {
				traverse(node[key], currentScope);
			}
		}
	}

	while (queue.length > 0) {
		const root = queue.shift();
		traverse(root, new Set());
	}

	const unreachableSideEffectImports = topLevelImports
		.filter((imp) => imp.isSideEffect && !reachableImports.has(imp.specifier))
		.map((imp) => imp.node);

	return {
		reachableImports,
		reachableDeclarations,
		unreachableSideEffectImports,
		isFallbackRoots,
		analyzed: true,
	};
}
