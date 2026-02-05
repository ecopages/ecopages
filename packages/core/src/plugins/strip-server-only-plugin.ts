/**
 * Bun plugin that strips server-only code from browser bundles.
 *
 * This plugin provides two mechanisms to prevent server-only code from being bundled:
 *
 * ## 1. `.server.ts` Convention (Recommended)
 *
 * Files with `.server.ts`, `.server.tsx`, `.server.js`, or `.server.jsx` extensions
 * are automatically stubbed out when bundling for the browser. This is the most
 * reliable way to keep server-only code out of client bundles.
 *
 * ```typescript
 * // src/lib/db.server.ts - NEVER bundled for browser
 * import { Database } from 'bun:sqlite';
 * export const db = new Database('app.db');
 *
 * // src/handlers/auth.server.ts - NEVER bundled for browser
 * import { db } from '@/lib/db.server';
 * export const authMiddleware = ...
 * ```
 *
 * ## 2. AST Stripping for `middleware` and `requires` Properties
 *
 * As a secondary mechanism, the plugin also strips `middleware` and `requires`
 * properties from `eco.page()` and `eco.component()` calls, and removes any
 * imports that become unused after stripping.
 *
 * @example
 * ```typescript
 * // Before transformation:
 * import { authMiddleware } from '@/handlers/auth.server';
 * export default eco.page({
 *   middleware: [authMiddleware],
 *   requires: ['session'],
 *   render: ({ locals }) => <Dashboard user={locals.session.user} />
 * });
 *
 * // After transformation:
 * export default eco.page({
 *   render: ({ locals }) => <Dashboard user={locals.session.user} />
 * });
 * ```
 *
 * @module strip-server-only-plugin
 */

import type { BunPlugin } from 'bun';
import { parseSync, type Program } from 'oxc-parser';

/**
 * Pattern to match `.server.ts`, `.server.tsx`, `.server.js`, `.server.jsx` files
 * Also matches import specifiers like `./foo.server` (without extension)
 */
const SERVER_FILE_PATTERN = /\.server(\.(ts|tsx|js|jsx))?$/;

/**
 * Properties that should be stripped from page configurations in browser bundles.
 * These properties are server-only and their imports should not be bundled for the client.
 */
export const SERVER_ONLY_PROPERTIES = new Set(['middleware', 'requires']);

/**
 * Options for configuring the strip-server-only plugin.
 */
export interface StripServerOnlyPluginOptions {
	/**
	 * Directory containing page files. Only files within this directory will be processed
	 * for AST stripping of middleware/requires properties.
	 */
	pagesDir: string;

	/**
	 * File extensions to process for AST stripping.
	 * @default ['.tsx', '.jsx', '.ts', '.js']
	 */
	extensions?: string[];

	/**
	 * Enable debug logging.
	 * @default false
	 */
	debug?: boolean;
}

interface RemovalRange {
	start: number;
	end: number;
	name: string;
}

/**
 * Collects all identifier names used within a node (recursively).
 */
function collectIdentifiers(node: unknown, identifiers: Set<string>): void {
	if (!node || typeof node !== 'object') return;

	const n = node as Record<string, unknown>;

	if (n.type === 'Identifier' || n.type === 'IdentifierReference') {
		const name = n.name as string | undefined;
		if (name) {
			identifiers.add(name);
		}
	}

	for (const value of Object.values(n)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				collectIdentifiers(item, identifiers);
			}
		} else if (value && typeof value === 'object') {
			collectIdentifiers(value, identifiers);
		}
	}
}

/**
 * Finds property locations in an eco.page() or eco.component() call that should be stripped.
 * Also collects identifiers used in those properties for import removal.
 *
 * @param node - Current AST node being visited
 * @param source - Original source code
 * @param ranges - Array to collect removal ranges (mutated by this function)
 * @param usedIdentifiers - Set to collect identifiers used in server-only properties
 */
export function findServerOnlyPropertyRanges(
	node: unknown,
	source: string,
	ranges: RemovalRange[],
	usedIdentifiers?: Set<string>,
): void {
	if (!node || typeof node !== 'object') return;

	const n = node as Record<string, unknown>;

	if (n.type === 'CallExpression') {
		const callee = n.callee as Record<string, unknown> | undefined;

		if (callee?.type === 'MemberExpression' || callee?.type === 'StaticMemberExpression') {
			const obj = callee.object as Record<string, unknown> | undefined;
			const prop = callee.property as Record<string, unknown> | undefined;

			if (
				obj?.type === 'Identifier' &&
				obj?.name === 'eco' &&
				(prop?.name === 'page' || prop?.name === 'component')
			) {
				const args = n.arguments as Array<Record<string, unknown>> | undefined;
				const firstArg = args?.[0];
				if (firstArg?.type === 'ObjectExpression') {
					const properties = firstArg.properties as Array<Record<string, unknown>> | undefined;
					if (properties) {
						for (const property of properties) {
							if (property.type === 'ObjectProperty' || property.type === 'Property') {
								const key = property.key as Record<string, unknown> | undefined;
								let keyName: string | undefined;

								if (key?.type === 'Identifier' || key?.type === 'IdentifierName') {
									keyName = key.name as string;
								} else if (key?.type === 'StringLiteral') {
									keyName = key.value as string;
								}

								if (keyName && SERVER_ONLY_PROPERTIES.has(keyName)) {
									const start = property.start as number | undefined;
									const end = property.end as number | undefined;

									if (typeof start === 'number' && typeof end === 'number') {
										let endPos = end;
										const afterProp = source.slice(end, end + 10);
										const commaMatch = afterProp.match(/^\s*,/);
										if (commaMatch) {
											endPos += commaMatch[0].length;
										}

										ranges.push({
											start,
											end: endPos,
											name: keyName,
										});

										if (usedIdentifiers) {
											const value = property.value as Record<string, unknown> | undefined;
											if (value) {
												collectIdentifiers(value, usedIdentifiers);
											}
										}
									}
								}
							}
						}
					}
				}
			}
		}
	}

	for (const value of Object.values(n)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				findServerOnlyPropertyRanges(item, source, ranges, usedIdentifiers);
			}
		} else if (value && typeof value === 'object') {
			findServerOnlyPropertyRanges(value, source, ranges, usedIdentifiers);
		}
	}
}

/**
 * Finds all identifier usages in the code, excluding import declarations.
 * This is used to determine which imports are still needed after stripping properties.
 */
function findAllUsedIdentifiers(node: unknown, usedIds: Set<string>, skipImports = true): void {
	if (!node || typeof node !== 'object') return;

	const n = node as Record<string, unknown>;

	if (skipImports && n.type === 'ImportDeclaration') {
		return;
	}

	if (n.type === 'Identifier' || n.type === 'IdentifierReference') {
		const name = n.name as string | undefined;
		if (name) {
			usedIds.add(name);
		}
	}

	for (const value of Object.values(n)) {
		if (Array.isArray(value)) {
			for (const item of value) {
				findAllUsedIdentifiers(item, usedIds, skipImports);
			}
		} else if (value && typeof value === 'object') {
			findAllUsedIdentifiers(value, usedIds, skipImports);
		}
	}
}

/**
 * Finds import declarations that should be removed because they only provide
 * identifiers used in server-only properties.
 */
function findUnusedImports(
	program: Program,
	source: string,
	serverOnlyIdentifiers: Set<string>,
	ranges: RemovalRange[],
): void {
	const body = program.body;
	if (!body) return;

	const usedInCode = new Set<string>();
	for (const stmt of body) {
		if (stmt.type !== 'ImportDeclaration') {
			findAllUsedIdentifiers(stmt, usedInCode, false);
		}
	}

	for (const id of serverOnlyIdentifiers) {
		usedInCode.delete(id);
	}

	for (const stmt of body) {
		if (stmt.type === 'ImportDeclaration') {
			const specifiers = stmt.specifiers;
			if (!specifiers || specifiers.length === 0) continue;

			const importedNames: string[] = [];
			for (const spec of specifiers) {
				const local = spec.local;
				const name = local?.name as string | undefined;
				if (name) {
					importedNames.push(name);
				}
			}

			const allUnused = importedNames.every((name) => serverOnlyIdentifiers.has(name) && !usedInCode.has(name));

			if (allUnused && importedNames.length > 0) {
				const start = stmt.start as number | undefined;
				const end = stmt.end as number | undefined;

				if (typeof start === 'number' && typeof end === 'number') {
					let endPos = end;
					const afterImport = source.slice(end, end + 5);
					if (afterImport.startsWith('\n')) {
						endPos += 1;
					}

					ranges.push({
						start,
						end: endPos,
						name: `import:${importedNames.join(',')}`,
					});
				}
			}
		}
	}
}

/**
 * Removes the specified ranges from source code.
 *
 * @param source - Original source code
 * @param ranges - Array of ranges to remove, sorted by start position descending
 * @returns Transformed source code
 */
export function removeRanges(source: string, ranges: RemovalRange[]): string {
	const sortedRanges = [...ranges].sort((a, b) => b.start - a.start);

	let result = source;
	for (const range of sortedRanges) {
		result = result.slice(0, range.start) + result.slice(range.end);
	}

	return result;
}

/**
 * Transforms source code by stripping server-only properties from eco.page() and eco.component() calls.
 * Also removes import statements that become unused after stripping these properties.
 *
 * @param source - The source code to transform
 * @param filePath - The file path (used for parsing)
 * @returns The transformed source code, or null if no transformation was needed
 */
export function transformSource(source: string, filePath: string): string | null {
	if (!source.includes('eco.page') && !source.includes('eco.component')) {
		return null;
	}

	let hasServerOnlyProps = false;
	for (const prop of SERVER_ONLY_PROPERTIES) {
		if (source.includes(prop)) {
			hasServerOnlyProps = true;
			break;
		}
	}

	if (!hasServerOnlyProps) {
		return null;
	}

	const result = parseSync(filePath, source);
	if (result.errors.length > 0) {
		return null;
	}

	const ranges: RemovalRange[] = [];
	const serverOnlyIdentifiers = new Set<string>();

	findServerOnlyPropertyRanges(result.program, source, ranges, serverOnlyIdentifiers);

	if (ranges.length === 0) {
		return null;
	}

	findUnusedImports(result.program, source, serverOnlyIdentifiers, ranges);

	return removeRanges(source, ranges);
}

/**
 * Creates a Bun plugin that strips server-only code from browser bundles.
 *
 * This plugin provides two mechanisms:
 *
 * 1. **`.server.ts` Convention**: Files matching `*.server.(ts|tsx|js|jsx)` are
 *    completely stubbed out, returning an empty module. This is the recommended
 *    approach for server-only code.
 *
 * 2. **AST Stripping**: For page files, strips `middleware` and `requires` properties
 *    from `eco.page()` and `eco.component()` calls, and removes unused imports.
 *
 * @param options - Plugin configuration options
 * @returns A Bun plugin instance
 *
 * @example
 * ```typescript
 * import { stripServerOnlyPlugin } from '@ecopages/core/plugins/strip-server-only-plugin';
 *
 * await Bun.build({
 *   entrypoints: ['./src/pages/dashboard.tsx'],
 *   target: 'browser',
 *   plugins: [
 *     stripServerOnlyPlugin({
 *       pagesDir: '/path/to/src/pages',
 *     }),
 *   ],
 * });
 * ```
 */
export function stripServerOnlyPlugin(options: StripServerOnlyPluginOptions): BunPlugin {
	const { pagesDir, extensions = ['.tsx', '.jsx', '.ts', '.js'], debug = false } = options;

	const extensionPattern = extensions.map((ext) => ext.replace(/^\./, '')).join('|');
	const pageFileFilter = new RegExp(`\\.(${extensionPattern})$`);

	return {
		name: 'strip-server-only-plugin',
		setup(build) {
			build.onResolve({ filter: /\.server/ }, (args) => {
				if (debug) {
					console.log(`[strip-server-only] Intercepting .server import: ${args.path}`);
				}
				return {
					path: args.path,
					namespace: 'server-stub',
				};
			});

			build.onLoad({ filter: /.*/, namespace: 'server-stub' }, (args) => {
				if (debug) {
					console.log(`[strip-server-only] Stubbing: ${args.path}`);
				}
				return {
					contents: `export default undefined;`,
					loader: 'js',
				};
			});

			build.onLoad({ filter: pageFileFilter, namespace: 'file' }, async (args) => {
				if (SERVER_FILE_PATTERN.test(args.path)) {
					return undefined;
				}

				if (!args.path.startsWith(pagesDir)) {
					return undefined;
				}

				const source = await Bun.file(args.path).text();

				try {
					const transformed = transformSource(source, args.path);

					if (transformed === null) {
						return undefined;
					}

					if (debug) {
						console.log(`[strip-server-only] Transformed ${args.path}`);
					}

					const loader = args.path.endsWith('.tsx')
						? 'tsx'
						: args.path.endsWith('.jsx')
							? 'jsx'
							: args.path.endsWith('.ts')
								? 'ts'
								: 'js';

					return {
						contents: transformed,
						loader,
					};
				} catch (error) {
					if (debug) {
						console.error(`[strip-server-only] Error processing ${args.path}:`, error);
					}
					return undefined;
				}
			});
		},
	};
}
