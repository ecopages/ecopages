/**
 * AST transforms for the client graph boundary plugin.
 */

import { extname } from 'node:path';
import { cachedParseSync } from '@ecopages/core/cache';
import type { RequestedExportRules } from './client-graph-boundary-cache.ts';
import { analyzeReachability } from './reachability-analyzer.ts';
import {
	isBareSpecifier,
	isProjectAliasSpecifier,
	isServerOnlySpecifier,
	toModuleBaseSpecifier,
	parseDeclaredModules,
	mergeDeclaredModulesMap,
	normalizeRequestedExportsKey,
	resolveRequestedExportsKey,
	mergeRequestedExportRules,
} from './client-graph-reachability.ts';

const SERVER_ONLY_ECO_PAGE_OPTION_KEYS = new Set([
	'cache',
	'middleware',
	'requires',
	'metadata',
	'staticProps',
	'staticPaths',
]);

/**
 * Returns the proper OxC parser dialect to use for string source parsing.
 *
 * @param filename - File path.
 * @returns Language string.
 */
function parserLanguageForFile(filename: string): 'js' | 'jsx' | 'ts' | 'tsx' {
	const extension = extname(filename).toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

/**
 * Extracts a static property key name from an object literal property node.
 *
 * The client graph boundary rewrite only strips known `eco.page(...)` keys when
 * it can prove the property name statically. Computed or otherwise dynamic keys
 * are ignored so the transform remains conservative.
 *
 * @param node - OXC AST node representing an object property key.
 * @returns Static property key name when it can be resolved, otherwise `undefined`.
 */
function getObjectPropertyKeyName(node: any): string | undefined {
	if (!node) return undefined;
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'StringLiteral' || node.type === 'Literal') {
		return typeof node.value === 'string' ? node.value : undefined;
	}
	return undefined;
}

/**
 * Removes server-only `eco.page(...)` options from browser-bound modules.
 *
 * Import pruning alone is not sufficient because a page module can still retain
 * references to stripped server imports through config fields like `middleware`
 * or `metadata`. This pass rewrites the `eco.page(...)` object literal so only
 * browser-relevant properties remain.
 *
 * @param source - Original or already-transformed module source.
 * @param program - Parsed OXC program for the same source text.
 * @returns Updated source plus a flag indicating whether any rewrite occurred.
 */
function stripServerOnlyEcoPageOptions(source: string, program: any): { transformed: string; modified: boolean } {
	const edits: { start: number; end: number; replacement: string }[] = [];

	function walk(node: any) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}

		if (
			node.type === 'CallExpression' &&
			node.callee?.type === 'MemberExpression' &&
			node.callee.object?.type === 'Identifier' &&
			node.callee.object.name === 'eco' &&
			node.callee.property?.type === 'Identifier' &&
			node.callee.property.name === 'page' &&
			node.arguments?.[0]?.type === 'ObjectExpression'
		) {
			const objectExpression = node.arguments[0];
			const keptProperties: string[] = [];
			let removedProperty = false;

			for (const property of objectExpression.properties ?? []) {
				if (property?.type === 'Property') {
					const keyName = getObjectPropertyKeyName(property.key);
					if (keyName && SERVER_ONLY_ECO_PAGE_OPTION_KEYS.has(keyName)) {
						removedProperty = true;
						continue;
					}
				}

				keptProperties.push(source.slice(property.start, property.end));
			}

			if (removedProperty) {
				const replacement = keptProperties.length > 0 ? `{ ${keptProperties.join(', ')} }` : '{}';
				edits.push({
					start: objectExpression.start,
					end: objectExpression.end,
					replacement,
				});
			}
		}

		for (const key in node) {
			if (key !== 'type' && key !== 'start' && key !== 'end') {
				walk(node[key]);
			}
		}
	}

	walk(program);

	if (edits.length === 0) {
		return { transformed: source, modified: false };
	}

	edits.sort((a, b) => b.start - a.start);
	let transformed = source;
	for (const edit of edits) {
		transformed = transformed.slice(0, edit.start) + edit.replacement + transformed.slice(edit.end);
	}

	return { transformed, modified: true };
}

/**
 * Parses a module using Oxc AST and surgically removes forbidden imports.
 * Filters down to the exact specifiers requested via `{namedImport}` syntax.
 *
 * @param source - The raw string source content of the module.
 * @param filename - The absolute path of the module.
 * @param globallyAllowed - A map of modules declared globally allowable by the build configuration.
 * @param requestedExports - Local requested-export registry used to propagate named reachability across files.
 * @returns An object containing the transformed string and a boolean indicating if changes occurred.
 */
export function transformModuleImports(
	source: string,
	filename: string,
	globallyAllowed: Map<string, Set<string> | '*'>,
	requestedExports: Map<string, RequestedExportRules>,
): { transformed: string; modified: boolean } {
	/**
	 * Parse the source
	 *
	 * We parse once here and then reuse the resulting `program` AST for both
	 * the local `modules` declaration walk (step 2) and the reachability analysis
	 * (step 3). Passing it through avoids a redundant second `parseSync` call inside
	 * `analyzeReachability`, cutting the per-file OxC work roughly in half.
	 */
	let result;
	try {
		result = cachedParseSync(filename, source, {
			sourceType: 'module',
			lang: parserLanguageForFile(filename),
		});
	} catch {
		return { transformed: source, modified: false };
	}

	const { program } = result;
	const localDeclared: string[] = [];

	/**
	 * Collect locally declared modules
	 *
	 * Walk the AST looking for `modules: [...]` array properties. These are the
	 * component-level allowlist declarations that a developer writes inside
	 * `eco.page({ modules: ['react', '@myorg/ui{Button}'] })` to explicitly opt
	 * specific packages into the client bundle.
	 *
	 * The collected specifiers are merged with the globally configured allowlist
	 * before any import filtering takes place.
	 */

	function walk(node: any) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walk(child);
			return;
		}

		if (node.type === 'Property' && node.key?.name === 'modules' && node.value?.type === 'ArrayExpression') {
			for (const el of node.value.elements) {
				if ((el.type === 'StringLiteral' || el.type === 'Literal') && typeof el.value === 'string') {
					localDeclared.push(el.value);
				}
			}
		}

		for (const key in node) {
			if (key !== 'type' && key !== 'start' && key !== 'end') {
				walk(node[key]);
			}
		}
	}

	walk(program);

	/**
	 * Merge allowlists and compute reachability
	 *
	 * Combine the globally declared modules (from plugin config) with the locally
	 * declared ones (from the component's `modules` array) into a single authoritative map.
	 *
	 * Then run the reachability analysis, passing the already-parsed `program` so the
	 * analyser skips its own internal `parseSync` call (see step 1 above).
	 */
	const locallyAllowed = parseDeclaredModules(localDeclared);
	const allowedMap = mergeDeclaredModulesMap(globallyAllowed, locallyAllowed);
	const explicitRequestedExports = requestedExports.get(normalizeRequestedExportsKey(filename));
	const reachability = analyzeReachability(source, filename, program, explicitRequestedExports);

	for (const statement of program.body) {
		if (statement.type === 'ImportDeclaration') {
			const reachableRules = reachability.reachableImports.get(statement.source.value as string);
			const requestedModuleKey = resolveRequestedExportsKey(filename, statement.source.value as string);
			if (!requestedModuleKey || !reachableRules) continue;

			mergeRequestedExportRules(requestedExports, requestedModuleKey, reachableRules);
			continue;
		}

		if (statement.type === 'ExportNamedDeclaration' && statement.source) {
			const reachableRules = reachability.reachableImports.get(statement.source.value as string);
			const requestedModuleKey = resolveRequestedExportsKey(filename, statement.source.value as string);
			if (!requestedModuleKey || !reachableRules) continue;

			mergeRequestedExportRules(requestedExports, requestedModuleKey, reachableRules);
			continue;
		}

		if (statement.type === 'ExportAllDeclaration' && statement.source) {
			const reachableRules = reachability.reachableImports.get(statement.source.value as string);
			const requestedModuleKey = resolveRequestedExportsKey(filename, statement.source.value as string);
			if (!requestedModuleKey || !reachableRules) continue;

			mergeRequestedExportRules(requestedExports, requestedModuleKey, reachableRules);
		}
	}

	/**
	 * Build the edit list
	 *
	 * Walk the AST a second time, this time inspecting every import/export/dynamic-import
	 * node against the combined allowlist and the reachability graph:
	 *
	 * - **Forbidden + unreachable** → replace with empty string (pruned).
	 * - **Forbidden + reachable from a known client root** → throw a build error so the
	 *   developer is forced to resolve the server-client boundary violation explicitly.
	 * - **Allowed with specific named rules** → surgically rewrite the import to keep only
	 *   the permitted named bindings; the bundler tree-shakes the rest.
	 * - **Allowed with no restrictions** → left untouched; the bundler handles tree-shaking.
	 */
	const edits: { start: number; end: number; replacement: string }[] = [];

	function processSpecifier(specifier: string): { allowed: boolean; rules?: Set<string> | '*' } {
		const moduleBase = toModuleBaseSpecifier(specifier);
		const explicitRules = allowedMap.get(moduleBase);

		if (isServerOnlySpecifier(specifier)) {
			if (explicitRules) {
				return { allowed: true, rules: explicitRules };
			}
			return { allowed: false };
		}

		if (isProjectAliasSpecifier(specifier)) return { allowed: true, rules: explicitRules ?? '*' };
		if (!isBareSpecifier(specifier)) return { allowed: true, rules: explicitRules ?? '*' };

		/** By default, bare specifiers (NPM modules) are allowed entirely. */
		return { allowed: true, rules: explicitRules ?? '*' };
	}

	function walkImports(node: any) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walkImports(child);
			return;
		}

		if (node.type === 'ImportDeclaration') {
			const specifier = node.source.value as string;
			const reachableRules = reachability.reachableImports.get(specifier);
			const { allowed, rules } = processSpecifier(specifier);

			if (!allowed) {
				if (reachableRules && !reachability.isFallbackRoots) {
					throw new Error(
						`[Ecopages Client Reachability] Forbidden client import '${specifier}' at ${filename}:${node.start}. This import is explicitly reachable from the React render function.`,
					);
				} else {
					edits.push({ start: node.start, end: node.end, replacement: '' });
				}
				return;
			}

			/**
			 * If it IS allowed by the base specifier, we must check if there are specific named rules.
			 * If there are specific rules (a Set), we must surgically remove any specifiers that aren't in the rule.
			 */
			if (rules instanceof Set && node.specifiers && node.specifiers.length > 0) {
				let keptSpecifierCount = 0;
				let defaultImportLocal: string | undefined;
				let namespaceImportLocal: string | undefined;
				const namedImportNodes: string[] = [];
				for (const spec of node.specifiers) {
					if (spec.type === 'ImportSpecifier') {
						const importedName =
							spec.imported.type === 'Identifier' ? spec.imported.name : (spec.imported.value as string);
						if (rules.has(importedName)) {
							keptSpecifierCount += 1;
							const localName = spec.local?.name;
							if (localName && localName !== importedName) {
								namedImportNodes.push(`${importedName} as ${localName}`);
							} else {
								namedImportNodes.push(importedName);
							}
						}
					} else if (spec.type === 'ImportDefaultSpecifier') {
						if (rules.has('default')) {
							keptSpecifierCount += 1;
							defaultImportLocal = spec.local.name;
						}
					} else if (spec.type === 'ImportNamespaceSpecifier') {
						if (rules.has('*')) {
							keptSpecifierCount += 1;
							namespaceImportLocal = spec.local.name;
						}
					}
				}

				if (keptSpecifierCount === 0) {
					edits.push({ start: node.start, end: node.end, replacement: '' });
				} else if (keptSpecifierCount < node.specifiers.length) {
					let newDeclaration = '';
					if (defaultImportLocal && namespaceImportLocal) {
						newDeclaration = `import ${defaultImportLocal}, * as ${namespaceImportLocal} from '${specifier}';`;
					} else if (namespaceImportLocal) {
						newDeclaration = `import * as ${namespaceImportLocal} from '${specifier}';`;
					} else if (defaultImportLocal && namedImportNodes.length > 0) {
						newDeclaration = `import ${defaultImportLocal}, { ${namedImportNodes.join(', ')} } from '${specifier}';`;
					} else if (defaultImportLocal) {
						newDeclaration = `import ${defaultImportLocal} from '${specifier}';`;
					} else {
						newDeclaration = `import { ${namedImportNodes.join(', ')} } from '${specifier}';`;
					}
					edits.push({ start: node.start, end: node.end, replacement: newDeclaration });
				}
				return;
			}

			/**
			 * If it IS allowed (globally or all specifiers match) and IS reachable,
			 * we can safely just leave the import alone.
			 * ESBuild will natively treeshake any bindings that are actually unused.
			 *
			 * However, if it is completely unreachable, and it's a side-effect import
			 * (no specifiers), we want to proactively prune it.
			 */
			if (!reachableRules && (!node.specifiers || node.specifiers.length === 0)) {
				edits.push({ start: node.start, end: node.end, replacement: '' });
			}

			return;
		}

		if (node.type === 'ExportNamedDeclaration' && node.source) {
			const specifier = node.source.value as string;
			const { allowed } = processSpecifier(specifier);

			if (!allowed) {
				const reachableRules = reachability.reachableImports.get(specifier);
				if (reachableRules && !reachability.isFallbackRoots) {
					throw new Error(
						`[Ecopages Client Reachability] Forbidden client export from '${specifier}' at ${filename}:${node.start}. This export is explicitly reachable from the React render function.`,
					);
				} else {
					edits.push({ start: node.start, end: node.end, replacement: '' });
				}
			}
			return;
		}

		if (node.type === 'ExportAllDeclaration' && node.source) {
			const specifier = node.source.value as string;
			const { allowed } = processSpecifier(specifier);
			if (!allowed) {
				const reachableRules = reachability.reachableImports.get(specifier);
				if (reachableRules && !reachability.isFallbackRoots) {
					throw new Error(
						`[Ecopages Client Reachability] Forbidden client export * from '${specifier}' at ${filename}:${node.start}. This export is explicitly reachable from the React render function.`,
					);
				} else {
					edits.push({ start: node.start, end: node.end, replacement: '' });
				}
			}
			return;
		}

		if (node.type === 'ImportExpression' && node.source?.value) {
			const specifier = node.source.value as string;
			const { allowed } = processSpecifier(specifier);
			const reachableRules = reachability.reachableImports.get(specifier);

			if (!reachableRules) {
				if (!allowed) {
					edits.push({ start: node.start, end: node.end, replacement: 'Promise.resolve({})' });
				}
				return;
			}

			if (!allowed) {
				if (!reachability.isFallbackRoots) {
					throw new Error(
						`[Ecopages Client Reachability] Forbidden dynamic import('${specifier}') at ${filename}:${node.start}. This import is explicitly reachable from the React render function.`,
					);
				} else {
					edits.push({ start: node.start, end: node.end, replacement: 'Promise.resolve({})' });
				}
			}
			return;
		}

		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
			const arg = node.arguments?.[0];
			if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal') && typeof arg.value === 'string') {
				const specifier = arg.value;
				const { allowed } = processSpecifier(specifier);
				const reachableRules = reachability.reachableImports.get(specifier);

				if (!reachableRules) {
					if (!allowed) {
						edits.push({ start: node.start, end: node.end, replacement: '({})' });
					}
				} else if (!allowed) {
					if (!reachability.isFallbackRoots) {
						throw new Error(
							`[Ecopages Client Reachability] Forbidden require('${specifier}') at ${filename}:${node.start}. This import is explicitly reachable from the React render function.`,
						);
					} else {
						edits.push({ start: node.start, end: node.end, replacement: '({})' });
					}
				}
			}
		}

		for (const key in node) {
			if (key !== 'type' && key !== 'start' && key !== 'end') {
				walkImports(node[key]);
			}
		}
	}
	walkImports(program);

	if (edits.length === 0) {
		return stripServerOnlyEcoPageOptions(source, program);
	}

	edits.sort((a, b) => b.start - a.start);
	let transformed = source;
	for (const edit of edits) {
		transformed = transformed.slice(0, edit.start) + edit.replacement + transformed.slice(edit.end);
	}

	let reparsedResult;
	try {
		reparsedResult = cachedParseSync(filename, transformed, {
			sourceType: 'module',
			lang: parserLanguageForFile(filename),
		});
	} catch {
		return { transformed, modified: true };
	}

	const strippedPageOptions = stripServerOnlyEcoPageOptions(transformed, reparsedResult.program);
	if (strippedPageOptions.modified) {
		return strippedPageOptions;
	}

	return { transformed, modified: true };
}
