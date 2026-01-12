/**
 * Bun plugin that auto-injects `componentDir` into EcoComponent config objects.
 *
 * This plugin injects the `componentDir` property into EcoComponent config objects
 * automatically. It intercepts file loading and transforms component config objects
 * to include the `componentDir` property based on the file's absolute path.
 *
 * @module
 */

import path from 'node:path';
import type { BunPlugin } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types.ts';
import { fileSystem } from '@ecopages/file-system';

/**
 * Regex pattern to match `.config = {` assignments in component files (EcoComponent).
 * i.e. `MyComponent.config = { ... }`
 */
const CONFIG_ASSIGNMENT_PATTERN = /\.config\s*=\s*\{/g;

/**
 * Regex pattern to match `config: {` in object literals.
 * Uses word boundary to avoid matching partial words like "myconfig:".
 * i.e. `export const MyElement = { config: { ... } }`
 */
const CONFIG_PROPERTY_PATTERN = /\bconfig\s*:\s*\{/g;

/**
 * Regex pattern to match `export const config = {` assignments.
 * i.e. `export const config = { ... }`
 */
const CONFIG_EXPORT_PATTERN = /export\s+const\s+config\s*=\s*\{/g;

/**
 * Regex pattern to match eco.component() and eco.page() declarations.
 * Matches: eco.component({ or eco.component<Type>({
 * i.e. `eco.component({ dependencies: ... })` or `eco.page<Props>({ ... })`
 */
const ECO_COMPONENT_PATTERN = /eco\.(component|page)(?:<[^>]+>)?\s*\(\s*\{/g;

/**
 * Creates a RegExp pattern from integration extensions.
 *
 * The pattern matches files ending with any of the provided extensions,
 * optionally followed by a query string (e.g., `file.tsx?update=123`).
 * Query strings are used for cache-busting in development mode.
 *
 * Always includes `.ts` to support definitions in plain
 * TypeScript files (commonly used for Lit elements and web components).
 *
 * @param extensions - Array of file extensions (e.g., ['.kita.tsx', '.ghtml.ts', '.tsx'])
 * @returns RegExp pattern that matches any of the extensions with optional query strings
 */
function createExtensionPattern(extensions: string[]): RegExp {
	if (extensions.length === 0) {
		return /\.(kita\.tsx|ghtml\.ts|ghtml\.tsx|lit\.tsx|ts)(\?.*)?$/;
	}

	const allExtensions = [...new Set([...extensions, '.ts'])].filter((ext) => ext !== '.mdx');
	const escaped = allExtensions.map((ext) => ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`(${escaped.join('|')})(\\?.*)?$`);
}

export interface EcoComponentDirPluginOptions {
	/** The EcoPages application configuration containing integration settings */
	config: EcoPagesAppConfig;
}

/**
 * Creates a Bun plugin that auto-injects `componentDir` into EcoComponent config objects.
 *
 * This plugin intercepts file loading for all integration-compatible files and:
 * 1. Strips any query string from the file path (for dev mode cache-busting)
 * 2. Reads the file contents
 * 3. Finds all `.config = {` assignments (EcoComponent) and `config: {` properties
 * 4. Injects `componentDir: "/path/to/component/dir"` as the first property
 * 5. Returns the transformed content with the appropriate loader
 *
 * The injected `componentDir` is used by the dependency resolution system to locate
 * relative script and stylesheet dependencies defined in component configs.
 *
 * @param options - Plugin options containing the EcoPages config
 * @returns A Bun plugin instance ready for registration with `Bun.plugin()`
 *
 * @example
 * ```typescript
 * const plugin = createEcoComponentDirPlugin({ config: appConfig });
 * await Bun.plugin(plugin);
 * ```
 */
export function createEcoComponentDirPlugin(options: EcoComponentDirPluginOptions): BunPlugin {
	const allExtensions = options.config.integrations.flatMap((integration) => integration.extensions);
	const extensionPattern = createExtensionPattern(allExtensions);

	return {
		name: 'eco-component-dir-plugin',
		setup(build) {
			build.onLoad({ filter: extensionPattern }, async (args) => {
				const filePath = args.path.split('?')[0];
				const contents = await fileSystem.readFile(filePath);
				const transformedContents = injectComponentDir(contents, filePath);

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
 * Injects `componentDir` into EcoComponent config objects in file content.
 * This utility can be used by integrations that handle their own file loading
 * (like MDX) but still need componentDir injection for dependency resolution.
 *
 * @param contents - The file content to transform
 * @param filePath - Absolute path to the file (used to derive componentDir)
 * @returns Transformed content with componentDir injected
 *
 * @example
 * ```typescript
 * const contents = await Bun.file(filePath).text();
 * const transformed = injectComponentDir(contents, filePath);
 * ```
 */
export function injectComponentDir(contents: string, filePath: string): string {
	const componentDir = path.dirname(filePath);

	let result = contents.replace(CONFIG_ASSIGNMENT_PATTERN, (match) => {
		return `${match}\n\tcomponentDir: "${componentDir}",`;
	});

	result = result.replace(CONFIG_PROPERTY_PATTERN, () => {
		return `config: {\n\t\tcomponentDir: "${componentDir}",`;
	});

	result = result.replace(CONFIG_EXPORT_PATTERN, (match) => {
		return `${match}\n\tcomponentDir: "${componentDir}",`;
	});

	// Handle eco.component() and eco.page() patterns
	result = result.replace(ECO_COMPONENT_PATTERN, (match) => {
		return `${match}\n\tcomponentDir: "${componentDir}",`;
	});

	return result;
}

export default createEcoComponentDirPlugin;
