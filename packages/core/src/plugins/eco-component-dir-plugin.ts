/**
 * Bun plugin that auto-injects `componentDir` into EcoComponent config objects.
 * This eliminates the need for developers to manually add `importMeta: import.meta`.
 *
 * @module
 */

import path from 'node:path';
import type { BunPlugin } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types.ts';

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
		return /\.(kita\.tsx|ghtml\.ts|ghtml\.tsx|lit\.tsx)$/;
	}

	const escaped = extensions.map((ext) => ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`(${escaped.join('|')})$`);
}

export interface EcoComponentDirPluginOptions {
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
 * The plugin uses the integration extensions from the provided config to determine
 * which files to process.
 *
 * @param options - Plugin options containing the EcoPages config
 * @returns A Bun plugin instance
 *
 * @example
 * ```typescript
 * const plugin = createEcoComponentDirPlugin({ config: appConfig });
 * ```
 */
export function createEcoComponentDirPlugin(options: EcoComponentDirPluginOptions): BunPlugin {
	const allExtensions = options.config.integrations.flatMap((integration) => integration.extensions);
	const extensionPattern = createExtensionPattern(allExtensions);

	return {
		name: 'eco-component-dir-plugin',
		setup(build) {
			build.onLoad({ filter: extensionPattern }, async (args) => {
				const contents = await Bun.file(args.path).text();
				const componentDir = path.dirname(args.path);

				const transformedContents = contents.replace(CONFIG_ASSIGNMENT_PATTERN, (match) => {
					return `${match}\n\tcomponentDir: "${componentDir}",`;
				});

				const ext = path.extname(args.path).slice(1) as 'ts' | 'tsx' | 'js' | 'jsx';

				return {
					contents: transformedContents,
					loader: ext || 'ts',
				};
			});
		},
	};
}

export default createEcoComponentDirPlugin;
