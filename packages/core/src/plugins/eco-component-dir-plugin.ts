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
 * Creates a RegExp pattern from integration extensions.
 *
 * @param extensions - Array of file extensions (e.g., ['.kita.tsx', '.ghtml.ts'])
 * @returns RegExp pattern that matches any of the extensions
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
 * When a component file is loaded, this plugin:
 * 1. Reads the file contents
 * 2. Finds all `.config = {` assignments
 * 3. Injects `componentDir: "/path/to/component/dir"` as the first property
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
