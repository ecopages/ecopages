/**
 * Bun plugin that auto-injects `__eco` metadata into EcoComponent config objects.
 *
 * This plugin uses AST parsing (via oxc-parser) to reliably inject the `__eco` property
 * into EcoComponent config objects at import time. The injected metadata contains:
 * - `dir`: The directory path of the component file (used for dependency resolution)
 * - `integration`: The integration type (e.g., 'react', 'kitajs', 'ghtml', 'lit')
 *
 * The plugin intercepts file loading for all configured integration extensions and
 * transforms component configs before they are executed.
 *
 * @example
 * ```typescript
 * // Before transformation:
 * export default eco.page({
 *   render: () => '<div>Hello</div>',
 * });
 *
 * // After transformation:
 * export default eco.page({
 *   __eco: { id: "<hash>", file: "/path/to/pages/index.tsx", integration: "react" },
 *   render: () => '<div>Hello</div>',
 * });
 * ```
 *
 * @module eco-component-meta-plugin
 */

import path from 'node:path';
import type { BunPlugin } from 'bun';
import { parseSync } from 'oxc-parser';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { fileSystem } from '@ecopages/file-system';
import { rapidhash } from '../utils/hash.ts';

/**
 * Pattern to match regex special characters that need escaping.
 * Used when building the file extension filter pattern.
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Set of valid Bun loader extensions.
 * Only files with these base extensions can be processed by Bun's loader system.
 */
const VALID_LOADER_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Checks if an extension can be handled by a valid Bun loader.
 *
 * Compound extensions like `.kita.tsx` are valid because the final
 * extension is `.tsx`, which Bun can process.
 *
 * @param ext - The file extension to check (e.g., '.tsx', '.kita.tsx')
 * @returns `true` if the extension ends with a valid loader extension
 */
function hasValidLoaderExtension(ext: string): boolean {
	for (const validExt of VALID_LOADER_EXTENSIONS) {
		if (ext.endsWith(validExt)) {
			return true;
		}
	}
	return false;
}

/**
 * Builds a mapping from file extensions to integration names.
 *
 * The mapping is sorted by extension length (longest first) to ensure
 * more specific extensions like `.kita.tsx` are matched before generic
 * ones like `.tsx`.
 *
 * @param integrations - Array of integration configurations from EcoPagesAppConfig
 * @returns Array of [extension, integrationName] tuples, sorted by specificity
 *
 * @example
 * ```typescript
 * const map = buildExtensionToIntegrationMap([
 *   { name: 'kitajs', extensions: ['.kita.tsx'] },
 *   { name: 'react', extensions: ['.tsx'] },
 * ]);
 * // Returns: [['.kita.tsx', 'kitajs'], ['.tsx', 'react']]
 * ```
 */
function buildExtensionToIntegrationMap(integrations: EcoPagesAppConfig['integrations']): [string, string][] {
	const mapping: [string, string][] = [];

	for (const integration of integrations) {
		for (const ext of integration.extensions) {
			mapping.push([ext, integration.name]);
		}
	}

	mapping.sort((a, b) => b[0].length - a[0].length);

	return mapping;
}

/**
 * Detects the integration type for a file based on its extension.
 *
 * Uses the pre-sorted extension-to-integration map to find the most
 * specific matching extension.
 *
 * @param filePath - Absolute path to the file
 * @param extensionToIntegration - Pre-built extension mapping from buildExtensionToIntegrationMap
 * @returns The integration identifier (e.g., 'react', 'kitajs', 'lit', 'ghtml')
 */
function detectIntegration(filePath: string, extensionToIntegration: [string, string][]): string {
	for (const [ext, integration] of extensionToIntegration) {
		if (filePath.endsWith(ext)) {
			return integration;
		}
	}
	return 'ghtml';
}

/**
 * Creates a RegExp pattern that matches files with any of the configured extensions.
 *
 * The pattern also matches optional query strings (e.g., `file.tsx?update=123`)
 * which are used for cache-busting in development mode.
 *
 * @param extensions - Array of file extensions to match
 * @returns RegExp pattern for use with Bun's onLoad filter
 * @throws Error if no extensions are provided
 *
 * @example
 * ```typescript
 * const pattern = createExtensionPattern(['.tsx', '.kita.tsx']);
 * pattern.test('component.tsx');           // true
 * pattern.test('component.tsx?v=123');     // true
 * pattern.test('component.ts');            // false
 * ```
 */
function createExtensionPattern(extensions: string[]): RegExp {
	if (extensions.length === 0) {
		throw new Error('[eco-component-meta-plugin] No extensions configured. At least one integration is required.');
	}
	const uniqueExtensions = [...new Set(extensions)];
	const escaped = uniqueExtensions.map((ext) => ext.replace(REGEX_SPECIAL_CHARS, '\\$&'));
	return new RegExp(`(${escaped.join('|')})(\\?.*)?$`);
}

/**
 * Options for creating the eco-component-meta-plugin.
 */
export interface EcoComponentDirPluginOptions {
	/** The EcoPages application configuration containing integration settings */
	config: EcoPagesAppConfig;
}

/**
 * Creates a Bun plugin that auto-injects `__eco` metadata into EcoComponent config objects.
 *
 * This plugin intercepts file loading for all integration-compatible files and:
 * 1. Strips any query string from the file path (for dev mode cache-busting)
 * 2. Reads the file contents
 * 3. Parses the AST using oxc-parser to find injection points
 * 4. Injects `__eco: { id: "...", file: "...", integration: "..." }` into config objects
 * 5. Returns the transformed content with the appropriate loader
 *
 * Supported patterns:
 * - `eco.page({ ... })` - Page component declarations
 * - `eco.component({ ... })` - Reusable component declarations
 * - `Component.config = { ... }` - Config assignment pattern
 * - `config: { ... }` - Config property in object literals
 * - `export const config = { ... }` - Exported config declarations
 *
 * @param options - Plugin options containing the EcoPages config
 * @returns A Bun plugin instance ready for registration
 *
 * @example
 * ```typescript
 * import { createEcoComponentMetaPlugin } from '@ecopages/core';
 *
 * const plugin = createEcoComponentMetaPlugin({ config: appConfig });
 * await Bun.plugin(plugin);
 * ```
 */
export function createEcoComponentMetaPlugin(options: EcoComponentDirPluginOptions): BunPlugin {
	return {
		name: 'eco-component-meta-plugin',
		setup(build) {
			const allExtensions = options.config.integrations
				.flatMap((integration) => integration.extensions)
				.filter(hasValidLoaderExtension);

			if (allExtensions.length === 0) {
				return;
			}

			const extensionPattern = createExtensionPattern(allExtensions);
			const extensionToIntegration = buildExtensionToIntegrationMap(options.config.integrations);

			build.onLoad({ filter: extensionPattern }, async (args) => {
				const filePath = args.path.split('?')[0];
				const contents = await fileSystem.readFile(filePath);
				const integration = detectIntegration(filePath, extensionToIntegration);
				const transformedContents = injectEcoMeta(contents, filePath, integration);

				const ext = path.extname(filePath).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';

				return {
					contents: transformedContents,
					loader: ext || 'ts',
				};
			});
		},
	};
}

/**
 * Represents a text insertion to be made in the source code.
 */
interface Insertion {
	/** Character position in the source where text should be inserted */
	position: number;
	/** The text to insert at the position */
	text: string;
}

/**
 * Recursively walks the AST (Abstract Syntax Tree) to find all injection points for `__eco` metadata.
 *
 * ## What is an AST?
 *
 * An AST is a tree representation of source code. Instead of treating code as text,
 * a parser breaks it down into a structured tree where each node represents a
 * syntactic construct (variable, function call, object, etc.).
 *
 * For example, this code:
 * ```typescript
 * eco.page({ render: () => 'hi' })
 * ```
 *
 * Becomes an AST like:
 * ```
 * CallExpression
 * ├── callee: MemberExpression
 * │   ├── object: Identifier (name: "eco")
 * │   └── property: Identifier (name: "page")
 * └── arguments: [
 *     └── ObjectExpression (start: 9)  <-- We inject here at position 10 (after "{")
 *         └── properties: [...]
 * ]
 * ```
 *
 * ## How this function works
 *
 * 1. **Recursive traversal**: Visits every node in the tree, checking each one
 * 2. **Pattern matching**: Checks if the current node matches one of our target patterns
 * 3. **Position tracking**: When a match is found, records the `start` position of the
 *    config object (the character index in the original source where `{` appears)
 * 4. **Insertion offset**: Adds +1 to insert right after the opening `{`
 *
 * ## Supported patterns
 *
 * | Pattern | AST Node Type | Example | File Types |
 * |---------|---------------|---------|------------|
 * | `eco.page({...})` | CallExpression | `export default eco.page({ render: () => 'hi' })` | All |
 * | `eco.component({...})` | CallExpression | `export const Btn = eco.component({ render: () => '<button/>' })` | All |
 * | `X.config = {...}` | AssignmentExpression | `MyComponent.config = { dependencies: [] }` | All |
 * | `config: {...}` | ObjectProperty | `const X: EcoComponent = { config: {...} }` | EcoComponent-typed only |
 *
 * ## Why AST over regex?
 *
 * Regex would fail on edge cases like:
 * - `eco.page<ComplexType<(arg: string) => void>>({...})` - generics with arrows
 * - `// eco.page({ commented out })` - comments
 * - `const str = "eco.page({ in a string })"` - string literals
 * - Nested objects that look like config patterns
 *
 * AST parsing understands the actual code structure, not just text patterns.
 *
 * @param node - Current AST node being visited (starts with the root Program node)
 * @param insertions - Array to collect insertion points (mutated by this function)
 * @param injection - The injection text to insert at each point (e.g., ` __eco: {...},`)
 * @param isInsideEcoComponent - Whether we're inside an EcoComponent-typed declaration
 */
function findInjectionPoints(
	node: unknown,
	insertions: Insertion[],
	injection: string,
	isInsideEcoComponent = false,
): void {
	if (!node || typeof node !== 'object') return;

	const n = node as Record<string, unknown>;

	/**
	 * Pattern 1: eco.page({...}) or eco.component({...})
	 * AST structure: CallExpression with MemberExpression callee where object is "eco"
	 */
	if (n.type === 'CallExpression') {
		const callee = n.callee as Record<string, unknown> | undefined;

		/**
		 * MemberExpression represents "something.property" syntax.
		 * StaticMemberExpression is oxc's variant for computed vs non-computed access.
		 */
		if (callee?.type === 'MemberExpression' || callee?.type === 'StaticMemberExpression') {
			const obj = callee.object as Record<string, unknown> | undefined;
			const prop = callee.property as Record<string, unknown> | undefined;

			/** Check: is this `eco.page(...)` or `eco.component(...)`? */
			if (
				obj?.type === 'Identifier' &&
				obj?.name === 'eco' &&
				(prop?.name === 'page' || prop?.name === 'component')
			) {
				/** Get the first argument - should be an object literal {...} */
				const args = n.arguments as Array<Record<string, unknown>> | undefined;
				const firstArg = args?.[0];
				if (firstArg?.type === 'ObjectExpression') {
					/**
					 * `start` is the character index where this object begins (the "{").
					 * Insert at position+1 to place content right after "{".
					 */
					const start = firstArg.start as number | undefined;
					if (typeof start === 'number') {
						insertions.push({ position: start + 1, text: injection });
					}
				}
			}
		}
	}

	/**
	 * Pattern 2: Something.config = {...}
	 * AST structure: AssignmentExpression with MemberExpression left side ending in "config"
	 * This pattern is safe for all files because it requires a qualifier (e.g., MyComponent.config).
	 */
	if (n.type === 'AssignmentExpression') {
		const left = n.left as Record<string, unknown> | undefined;
		const right = n.right as Record<string, unknown> | undefined;

		/** Case: MyComponent.config = {...} */
		if (left?.type === 'MemberExpression' || left?.type === 'StaticMemberExpression') {
			const prop = left.property as Record<string, unknown> | undefined;
			if (prop?.name === 'config' && right?.type === 'ObjectExpression') {
				const start = right.start as number | undefined;
				if (typeof start === 'number') {
					insertions.push({ position: start + 1, text: injection });
				}
			}
		}
	}

	/**
	 * Pattern 3: { config: {...} } - config as an object property inside EcoComponent
	 * AST structure: ObjectProperty/Property with key "config" and value as ObjectExpression
	 *
	 * This pattern is matched when the parent VariableDeclarator has a type annotation
	 * containing "EcoComponent", e.g., `const X: EcoComponent = { config: {...} }`
	 *
	 * We track whether we're inside an EcoComponent-typed object via the `isInsideEcoComponent` flag.
	 */
	if (n.type === 'ObjectProperty' || n.type === 'Property') {
		const key = n.key as Record<string, unknown> | undefined;
		const value = n.value as Record<string, unknown> | undefined;

		if (
			(key?.type === 'Identifier' || key?.type === 'IdentifierName') &&
			key?.name === 'config' &&
			value?.type === 'ObjectExpression' &&
			isInsideEcoComponent
		) {
			const start = value.start as number | undefined;
			if (typeof start === 'number') {
				insertions.push({ position: start + 1, text: injection });
			}
		}
	}

	/**
	 * Check if we're entering an EcoComponent-typed variable declaration.
	 * This sets a flag for child nodes to know they're inside an EcoComponent.
	 *
	 * Type annotation is on the `id` (Identifier), not the VariableDeclarator directly.
	 * e.g., `const X: EcoComponent = {...}` has the annotation on the "X" Identifier.
	 */
	let childIsInsideEcoComponent = isInsideEcoComponent;
	if (n.type === 'VariableDeclarator') {
		const id = n.id as Record<string, unknown> | undefined;
		const typeAnnotation = id?.typeAnnotation as Record<string, unknown> | undefined;
		if (typeAnnotation) {
			const typeStr = JSON.stringify(typeAnnotation);
			if (typeStr.includes('EcoComponent')) {
				childIsInsideEcoComponent = true;
			}
		}
	}

	/**
	 * Recursive traversal: Visit all child nodes in the AST.
	 *
	 * This is how we "walk" the tree - for each property of the current node,
	 * if it's an array (like `body` containing statements) or an object (like `callee`),
	 * we recursively call findInjectionPoints on it.
	 * We skip metadata properties (start, end, type) that don't contain child nodes.
	 */
	for (const key in n) {
		if (key === 'start' || key === 'end' || key === 'type') continue;

		const value = n[key];
		if (Array.isArray(value)) {
			for (const child of value) {
				findInjectionPoints(child, insertions, injection, childIsInsideEcoComponent);
			}
		} else if (typeof value === 'object' && value !== null) {
			findInjectionPoints(value, insertions, injection, childIsInsideEcoComponent);
		}
	}
}

/**
 * Injects `__eco` metadata into EcoComponent config objects in file content.
 *
 * Uses oxc-parser for robust AST-based code analysis, which handles edge cases
 * that regex-based approaches would miss (e.g., complex generics, nested objects,
 * comments, string literals containing similar patterns).
 *
 * The injection is performed by:
 * 1. Parsing the source code into an AST
 * 2. Walking the AST to find all config object patterns
 * 3. Collecting insertion points (sorted in reverse order to preserve positions)
 * 4. Inserting the `__eco` property at each point
 *
 * @param contents - The source code content to transform
 * @param filePath - Absolute path to the file (used to derive the directory)
 * @param integration - The integration identifier for this file type
 * @returns Transformed source code with `__eco` injected, or original if no patterns found
 *
 * @example
 * ```typescript
 * const result = injectEcoMeta(
 *   'export default eco.page({ render: () => "<div>Hi</div>" });',
 *   '/app/src/pages/index.tsx',
 *   'react'
 * );
 * // Result: 'export default eco.page({ __eco: { id: "<hash>", file: "/app/src/pages/index.tsx", integration: "react" }, render: () => "<div>Hi</div>" });'
 * ```
 */
export function injectEcoMeta(contents: string, filePath: string, integration: string): string {
	const result = parseSync(filePath, contents);

	if (result.errors.length > 0) {
		console.warn(`[eco-component-meta-plugin] Parse errors in ${filePath}:`, result.errors);
		return contents;
	}

	const ast = result.program;
	const id = rapidhash(filePath).toString(36);
	const injection = ` __eco: { id: "${id}", file: "${filePath}", integration: "${integration}" },`;

	const insertions: Insertion[] = [];
	findInjectionPoints(ast, insertions, injection);

	if (insertions.length === 0) {
		return contents;
	}

	insertions.sort((a, b) => b.position - a.position);

	let transformed = contents;
	for (const { position, text } of insertions) {
		transformed = transformed.slice(0, position) + text + transformed.slice(position);
	}

	return transformed;
}

export default createEcoComponentMetaPlugin;
