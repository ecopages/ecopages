/**
 * @module ClientGraphBoundaryPlugin
 *
 * This module defines the primary esbuild plugin responsible for securing the Ecopages
 * isomorphic compilation pipeline. It ensures that backend-only code, sensitive Node.js APIs,
 * and massive server utilities do not accidentally leak into the browser bundle.
 *
 * It achieves this by intercepting all client module compilation passes and applying the
 * `analyzeReachability` AST pass. If a forbidden import (e.g. `node:fs` or `*.server.ts`)
 * is completely unreachable from the client component's `render` function, it is surgically
 * pruned. If a forbidden import IS reachable, the build is intentionally failed to prevent
 * runtime hydration crashes.
 *
 * Additionally, this plugin provides a build-time transform that statically resolves and
 * inlines `fs.readFileSync(path.resolve(...))` calls to prevent server/client data mismatches.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { parseSync } from 'oxc-parser';
import { analyzeReachability } from './reachability-analyzer';

const SOURCE_FILE_FILTER = /\.(tsx?|jsx?)$/;

/**
 * Configuration options for the Client Graph Boundary esbuild plugin.
 *
 * This plugin serves as the primary security layer between server-only logic and the client-side JavaScript bundle.
 * It prevents Node.js built-ins (`node:fs`, `node:path`) and backend-exclusive dependencies (e.g. `pg`, `redis`)
 * from accidentally leaking into the browser compilation step, which would cause immediate crashes.
 */
type ClientGraphBoundaryOptions = {
	/** Absolute path to the current working directory, used as a root fallback for resolving inline file reads. */
	absWorkingDir?: string;
	/**
	 * Array of module specifiers that are explicitly whitelisted to be bundled in the client code.
	 * This is typically populated by parsing `modules: ["..."]` declarations in React/Lit components.
	 */
	declaredModules?: string[];
	/** Array of emergency escape-hatch specifiers that always bypass the boundary checks regardless of component declarations. */
	alwaysAllowSpecifiers?: string[];
};

/**
 * Evaluates whether a module import is referencing an external package dependency
 * (e.g., `react` or `lodash`) as opposed to a local internal file (e.g., `./component` or `/absolute/path`).
 *
 * This is a critical building block for the graph boundary. We only want to restrict
 * specific external dependencies (like server-only utilities) from entering the client bundle,
 * while allowing all normal local relative UI component imports to flow through Esbuild safely.
 *
 * @param specifier - The raw import string found in the source code (e.g., `./Button.tsx` or `node:fs`)
 * @returns True if the import string refers to a top-level package or Node built-in.
 */
function isBareSpecifier(specifier: string): boolean {
	if (specifier.startsWith('.')) return false;
	if (specifier.startsWith('/')) return false;
	if (specifier.includes('://')) return false;
	return true;
}

function isProjectAliasSpecifier(specifier: string): boolean {
	return specifier.startsWith('@/') || specifier.startsWith('~/') || specifier.startsWith('ecopages:');
}

/**
 * Determines whether a specifier should be treated as server-only.
 *
 * This covers Node built-ins as well as local module conventions such as
 * `.server.ts` and extensionless imports that resolve to `.server.*` files.
 *
 * @param specifier - Raw import specifier from the module source.
 * @returns True when the import must never become client-reachable.
 */
function isServerOnlySpecifier(specifier: string): boolean {
	if (specifier.startsWith('node:')) return true;
	return /(?:^|[/])[^/]+\.server(?:$|\.)/.test(specifier);
}

/**
 * Strips down a deep path module specifier to its foundational root package name.
 *
 * When checking against the "allowed modules" whitelist, a component might import something deeply
 * nested like `lodash/fp/map` or `@myorg/ui/button`. However, the user configuration only whitelists
 * the root `lodash` or `@myorg/ui` package. This normalizer ensures we are comparing apples to apples
 * by extracting the base package scope before checking the authorization list.
 *
 * @example
 * toModuleBaseSpecifier('@scope/package/deep/file') -> '@scope/package'
 * toModuleBaseSpecifier('lodash/cloneDeep') -> 'lodash'
 * toModuleBaseSpecifier('node:fs') -> 'node:fs'
 *
 * @param specifier - The raw import specifier from the code.
 * @returns The root package name, preserving scoped npm organizations.
 */
function toModuleBaseSpecifier(specifier: string): string {
	if (!isBareSpecifier(specifier) || specifier.startsWith('node:')) {
		return specifier;
	}

	if (specifier.startsWith('@')) {
		const [scope, name] = specifier.split('/');
		if (!scope || !name) return specifier;
		return `${scope}/${name}`;
	}

	const [name] = specifier.split('/');
	return name ?? specifier;
}

/**
 * Parses the grammar syntax of declared modules.
 * Handles patterns like `@pkg/name` and `@pkg/name{namedImport,anotherImport}`
 * returning a map of base packages to their explicitly allowed specifiers.
 *
 * @param moduleDeclarations - A list of module declaration strings.
 * @returns A structured map of allowed packages and their named exports.
 */
function parseDeclaredModules(moduleDeclarations: string[] | undefined): Map<string, Set<string> | '*'> {
	const map = new Map<string, Set<string> | '*'>();
	for (const declaration of moduleDeclarations ?? []) {
		const source = declaration.trim();
		if (source.length === 0) continue;
		const openBraceIndex = source.indexOf('{');
		if (openBraceIndex < 0) {
			map.set(toModuleBaseSpecifier(source), '*');
			continue;
		}

		const closeBraceIndex = source.indexOf('}', openBraceIndex);
		const rawPkg = source.slice(0, openBraceIndex).trim();
		if (rawPkg.length === 0) continue;
		const pkg = toModuleBaseSpecifier(rawPkg);

		const namedImportsStr =
			closeBraceIndex > openBraceIndex
				? source.slice(openBraceIndex + 1, closeBraceIndex)
				: source.slice(openBraceIndex + 1);

		const namedImports = namedImportsStr
			.split(',')
			.map((s) => s.trim())
			.filter(Boolean);

		const existing = map.get(pkg);
		if (existing === '*') continue;

		if (!existing) {
			if (namedImports.length === 0) {
				map.set(pkg, '*');
			} else {
				map.set(pkg, new Set(namedImports));
			}
		} else {
			for (const name of namedImports) {
				existing.add(name);
			}
		}
	}
	return map;
}

/**
 * Merges two declared module maps, combining their allowable specific scopes.
 *
 * @param a - First map of declared modules.
 * @param b - Second map of declared modules to merge into the first.
 * @returns A unified map of both declarations.
 */
function mergeDeclaredModulesMap(
	a: Map<string, Set<string> | '*'>,
	b: Map<string, Set<string> | '*'>,
): Map<string, Set<string> | '*'> {
	const result = new Map(a);
	for (const [pkg, imports] of b.entries()) {
		const existing = result.get(pkg);
		if (existing === '*') continue;
		if (imports === '*') {
			result.set(pkg, '*');
			continue;
		}
		if (!existing) {
			result.set(pkg, imports);
		} else {
			for (const name of imports) {
				existing.add(name);
			}
		}
	}
	return result;
}

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
 * Tracks the subset of exports that a downstream local module is allowed to expose.
 *
 * `'*'` means the full module namespace is reachable, while a `Set` limits the
 * consumer to specific named exports.
 */
type RequestedExportRules = Set<string> | '*';

/**
 * Normalizes a file path into a registry key used for requested-export propagation.
 *
 * The normalization strips JS/TS extensions and collapses `/index` suffixes so
 * equivalent local import forms resolve to the same key.
 *
 * @param pathname - Absolute or resolved local module path.
 * @returns Stable registry key for `requestedExports`.
 */
function normalizeRequestedExportsKey(pathname: string): string {
	let normalized = pathname.replace(/\\/g, '/');
	normalized = normalized.replace(/\.(tsx?|jsx?)$/i, '');
	if (normalized.endsWith('/index')) {
		normalized = normalized.slice(0, -'/index'.length);
	}
	return normalized;
}

/**
 * Resolves a local import specifier into a requested-export registry key.
 *
 * Bare package specifiers and project aliases are intentionally ignored because
 * requested-export propagation is only used for cross-file local reachability.
 *
 * @param importer - Absolute path of the importing module.
 * @param specifier - Raw import or re-export specifier.
 * @returns Registry key for a local dependency, or `undefined` when not applicable.
 */
function resolveRequestedExportsKey(importer: string, specifier: string): string | undefined {
	if (isBareSpecifier(specifier) || isProjectAliasSpecifier(specifier)) {
		return undefined;
	}

	const resolved = specifier.startsWith('/') ? specifier : resolve(dirname(importer), specifier);
	return normalizeRequestedExportsKey(resolved);
}

/**
 * Merges newly discovered requested-export rules into the local propagation registry.
 *
 * Once a module is promoted to `'*'`, it stays fully reachable for the remainder
 * of the transform pass.
 *
 * @param registry - Cross-module requested-export registry.
 * @param moduleKey - Normalized local module key.
 * @param rules - Newly observed reachable export rules for the module.
 */
function mergeRequestedExportRules(
	registry: Map<string, RequestedExportRules>,
	moduleKey: string,
	rules: Set<string> | '*',
) {
	const existing = registry.get(moduleKey);
	if (existing === '*') return;
	if (rules === '*') {
		registry.set(moduleKey, '*');
		return;
	}
	if (!existing) {
		registry.set(moduleKey, new Set(rules));
		return;
	}
	for (const rule of rules) {
		existing.add(rule);
	}
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
function transformModuleImports(
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
		result = parseSync(filename, source, {
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
	 *   the permitted named bindings; esbuild tree-shakes the rest.
	 * - **Allowed with no restrictions** → left untouched; esbuild handles tree-shaking.
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
 * Instantiates the client graph boundary esbuild plugin.
 *
 * @param options - Configuration options for the graph boundary.
 * @returns The resulting `EcoBuildPlugin`.
 */
export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	return {
		name: 'ecopages-client-graph-boundary',
		setup(build) {
			const absWorkingDir = options?.absWorkingDir ?? process.cwd();
			const globallyDeclaredSources = parseDeclaredModules(options?.declaredModules);
			const requestedExports = new Map<string, RequestedExportRules>();
			for (const alwaysAllow of options?.alwaysAllowSpecifiers ?? []) {
				globallyDeclaredSources.set(toModuleBaseSpecifier(alwaysAllow), '*');
			}

			/**
			 * Source-level transform: replace static `fs.readFileSync(path.resolve('./...'), 'utf-8')`
			 * calls with the actual file content inlined as a string literal at build time.
			 *
			 * This prevents server/client hydration mismatches when components read files at module
			 * scope — the browser bundle will contain the same content the server rendered, so React
			 * never needs to enter client-render recovery mode.
			 */
			build.onLoad({ filter: SOURCE_FILE_FILTER }, (args) => {
				let source: string;
				try {
					source = readFileSync(args.path, 'utf-8');
				} catch {
					return undefined;
				}

				let transformed = source;
				let modified = false;

				if (source.includes('readFileSync')) {
					const readFileTransformed = transformed.replace(
						/\bfs\.readFileSync\s*\(\s*path\.resolve\s*\(\s*(['"`])([^'"`\n]+)\1\s*\)\s*,\s*['"`]utf-?8['"`]\s*\)/g,
						(_match, _q, relPath) => {
							modified = true;
							try {
								const sourceDir = dirname(args.path);
								const srcDirIndex = args.path.lastIndexOf('/src/');
								const inferredProjectRoot =
									srcDirIndex >= 0 ? args.path.slice(0, srcDirIndex) : undefined;
								const candidates = [
									resolve(absWorkingDir, relPath),
									resolve(process.cwd(), relPath),
									resolve(sourceDir, relPath),
									...(inferredProjectRoot ? [resolve(inferredProjectRoot, relPath)] : []),
								];

								const absolutePath = candidates.find((candidate) => existsSync(candidate));
								if (!absolutePath) return '""';

								const content = readFileSync(absolutePath, 'utf-8');
								return JSON.stringify(content);
							} catch {
								return '""';
							}
						},
					);
					transformed = readFileTransformed;
				}

				const { transformed: oxcTransformed, modified: importsModified } = transformModuleImports(
					transformed,
					args.path,
					globallyDeclaredSources,
					requestedExports,
				);

				if (importsModified) {
					modified = true;
					transformed = oxcTransformed;
				}

				if (!modified) return undefined;

				const ext = extname(args.path).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';
				return { contents: transformed, loader: ext };
			});
		},
	};
}
