import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import type { EcoBuildPlugin } from '@ecopages/core/build/build-types';
import { parseSync } from 'oxc-parser';

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

function parserLanguageForFile(filename: string): 'js' | 'jsx' | 'ts' | 'tsx' {
	const extension = extname(filename).toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

/**
 * Parses a module using Oxc AST and surgically removes forbidden imports.
 * Filters down to the exact specifiers requested via `{namedImport}` syntax.
 */
function transformModuleImports(
	source: string,
	filename: string,
	globallyAllowed: Map<string, Set<string> | '*'>,
): { transformed: string; modified: boolean } {
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

	/** Use any here because Oxc AST nodes are highly dynamic */
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

	const locallyAllowed = parseDeclaredModules(localDeclared);
	const allowedMap = mergeDeclaredModulesMap(globallyAllowed, locallyAllowed);

	const edits: { start: number; end: number; replacement: string }[] = [];

	function processSpecifier(specifier: string): { allowed: boolean; rules?: Set<string> | '*' } {
		if (specifier.startsWith('node:')) return { allowed: false };
		if (isProjectAliasSpecifier(specifier)) return { allowed: true, rules: '*' };
		if (!isBareSpecifier(specifier)) return { allowed: true, rules: '*' };

		const moduleBase = toModuleBaseSpecifier(specifier);
		if (allowedMap.has(moduleBase)) {
			return { allowed: true, rules: allowedMap.get(moduleBase) };
		}
		return { allowed: false };
	}

	/** Use any here because Oxc AST nodes are highly dynamic */
	function walkImports(node: any) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const child of node) walkImports(child);
			return;
		}

		if (node.type === 'ImportDeclaration') {
			const specifier = node.source.value as string;
			const { allowed, rules } = processSpecifier(specifier);

			if (!allowed) {
				edits.push({ start: node.start, end: node.end, replacement: '' });
			} else if (rules && rules !== '*') {
				const specifiers = node.specifiers || [];
				if (specifiers.length === 0) {
					edits.push({ start: node.start, end: node.end, replacement: '' });
				} else {
					const keptSpecifiers: string[] = [];
					let keptDefault: string | undefined;
					let keptNamespace: string | undefined;

					for (const spec of specifiers) {
						if (spec.type === 'ImportDefaultSpecifier') {
							if (rules.has('default')) keptDefault = spec.local.name;
						} else if (spec.type === 'ImportNamespaceSpecifier') {
							if (rules.has('*')) keptNamespace = spec.local.name;
						} else if (spec.type === 'ImportSpecifier') {
							const importedName = spec.imported.name || spec.imported.value;
							if (rules.has(importedName)) {
								if (importedName === spec.local.name) {
									keptSpecifiers.push(importedName);
								} else {
									keptSpecifiers.push(`${importedName} as ${spec.local.name}`);
								}
							}
						}
					}

					const parts = [];
					if (keptDefault) parts.push(keptDefault);
					if (keptNamespace) parts.push(`* as ${keptNamespace}`);
					if (keptSpecifiers.length > 0) parts.push(`{ ${keptSpecifiers.join(', ')} }`);

					if (parts.length > 0) {
						const typePrefix = node.importKind === 'type' ? 'type ' : '';
						edits.push({
							start: node.start,
							end: node.end,
							replacement: `import ${typePrefix}${parts.join(', ')} from '${specifier}';`,
						});
					} else {
						edits.push({ start: node.start, end: node.end, replacement: '' });
					}
				}
			}
			/**
			 * Do not traverse inside ImportDeclaration
			 */
			return;
		}

		if (node.type === 'ExportNamedDeclaration' && node.source) {
			const specifier = node.source.value as string;
			const { allowed, rules } = processSpecifier(specifier);

			if (!allowed) {
				edits.push({ start: node.start, end: node.end, replacement: '' });
			} else if (rules && rules !== '*') {
				const specifiers = node.specifiers || [];
				if (specifiers.length === 0) {
					edits.push({ start: node.start, end: node.end, replacement: '' });
				} else {
					const keptSpecifiers: string[] = [];
					for (const spec of specifiers) {
						if (spec.type === 'ExportSpecifier') {
							const exportedName = spec.exported.name || spec.exported.value;
							const localName = spec.local.name;
							if (rules.has(localName) || rules.has(exportedName)) {
								if (localName === exportedName) {
									keptSpecifiers.push(localName);
								} else {
									keptSpecifiers.push(`${localName} as ${exportedName}`);
								}
							}
						}
					}
					if (keptSpecifiers.length > 0) {
						const typePrefix = node.exportKind === 'type' ? 'type ' : '';
						edits.push({
							start: node.start,
							end: node.end,
							replacement: `export ${typePrefix}{ ${keptSpecifiers.join(', ')} } from '${specifier}';`,
						});
					} else {
						edits.push({ start: node.start, end: node.end, replacement: '' });
					}
				}
			}
			return;
		}

		if (node.type === 'ExportAllDeclaration' && node.source) {
			const specifier = node.source.value as string;
			const { allowed, rules } = processSpecifier(specifier);
			if (!allowed || (rules && rules !== '*')) {
				edits.push({ start: node.start, end: node.end, replacement: '' });
			}
			return;
		}

		if (node.type === 'ImportExpression' && node.source?.value) {
			const specifier = node.source.value as string;
			const { allowed } = processSpecifier(specifier);
			if (!allowed) {
				edits.push({ start: node.start, end: node.end, replacement: 'Promise.resolve({})' });
			}
			return;
		}

		if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'require') {
			const arg = node.arguments?.[0];
			if (arg && (arg.type === 'StringLiteral' || arg.type === 'Literal') && typeof arg.value === 'string') {
				const specifier = arg.value;
				const { allowed } = processSpecifier(specifier);
				if (!allowed) {
					edits.push({ start: node.start, end: node.end, replacement: '({})' });
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

export function createClientGraphBoundaryPlugin(options?: ClientGraphBoundaryOptions): EcoBuildPlugin {
	return {
		name: 'ecopages-client-graph-boundary',
		setup(build) {
			const absWorkingDir = options?.absWorkingDir ?? process.cwd();
			const globallyDeclaredSources = parseDeclaredModules(options?.declaredModules);
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
