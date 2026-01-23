/**
 * Bun plugin that auto-injects `__eco` metadata into EcoComponent config objects.
 *
 * This plugin injects the `__eco` property (containing `import.meta` and integration info)
 * into EcoComponent config objects automatically. It intercepts file loading and transforms
 * component config objects based on the file's extension and path.
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
 * Uses non-greedy .*? to handle nested generics and function types
 * i.e. `eco.component({ dependencies: ... })` or `eco.page<Props<(arg: string) => void>>({ ... })`
 */
const ECO_COMPONENT_PATTERN = /eco\.(component|page)(?:<.*?>)?\s*\(\s*\{/g;

/**
 * Regex special characters for escaping in patterns
 */
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Valid Bun loader extensions that this plugin can handle
 */
const VALID_LOADER_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Checks if an extension can be handled by a valid Bun loader.
 * Compound extensions like `.kita.tsx` are valid because the final extension is `.tsx`.
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
 * Builds an extension-to-integration mapping from the config's integrations.
 * Extensions are sorted by specificity (longer extensions first) to ensure
 * more specific extensions like `.kita.tsx` are matched before `.tsx`.
 *
 * @param integrations - The integration plugins from the app config
 * @returns Array of [extension, integration name] tuples sorted by specificity
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
 * Detects the integration type from a file path based on its extension.
 *
 * @param filePath - The file path to analyze
 * @param extensionToIntegration - The extension-to-integration mapping
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
 * Creates a RegExp pattern from integration extensions.
 *
 * The pattern matches files ending with any of the provided extensions,
 * optionally followed by a query string (e.g., `file.tsx?update=123`).
 * Query strings are used for cache-busting in development mode.
 *
 * @param extensions - Array of file extensions (e.g., ['.kita.tsx', '.ghtml.ts', '.tsx'])
 * @returns RegExp pattern that matches any of the extensions with optional query strings
 */
function createExtensionPattern(extensions: string[]): RegExp {
	if (extensions.length === 0) {
		throw new Error('[eco-component-meta-plugin] No extensions configured. At least one integration is required.');
	}
	const uniqueExtensions = [...new Set(extensions)];
	const escaped = uniqueExtensions.map((ext) => ext.replace(REGEX_SPECIAL_CHARS, '\\$&'));
	return new RegExp(`(${escaped.join('|')})(\\?.*)?$`);
}

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
 * 3. Finds all `.config = {` assignments (EcoComponent), `config: {` properties, and `eco.component/page()` calls
 * 4. Injects `__eco: { meta: import.meta, integration: "..." }` as the first property
 * 5. Returns the transformed content with the appropriate loader
 *
 * The injected `__eco` provides:
 * - `meta.dir`: Used for dependency resolution (replaces the old `componentDir`)
 * - `integration`: Used for selecting the correct renderer
 *
 * @param options - Plugin options containing the EcoPages config
 * @returns A Bun plugin instance ready for registration with `Bun.plugin()`
 *
 * @example
 * ```typescript
 * const plugin = createEcoComponentMetaPlugin({ config: appConfig });
 * await Bun.plugin(plugin);
 * ```
 */
export function createEcoComponentMetaPlugin(options: EcoComponentDirPluginOptions): BunPlugin {
	const allExtensions = options.config.integrations
		.flatMap((integration) => integration.extensions)
		.filter(hasValidLoaderExtension);
	const extensionPattern = createExtensionPattern(allExtensions);
	const extensionToIntegration = buildExtensionToIntegrationMap(options.config.integrations);

	return {
		name: 'eco-component-meta-plugin',
		setup(build) {
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
 * Injects `__eco` metadata into EcoComponent config objects in file content.
 *
 * For TSX/TS files: Injects into `.config = {`, `config: {`, and `eco.component/page()` patterns.
 * For MDX files: Appends a separate `export const __eco = {...}` to avoid collision with user's config.
 *
 * @param contents - The file content to transform
 * @param filePath - Absolute path to the file
 * @param integration - The integration identifier for this file
 * @returns Transformed content with __eco injected
 */
export function injectEcoMeta(contents: string, filePath: string, integration: string): string {
	const componentDir = path.dirname(filePath);

	const injection = `__eco: { dir: "${componentDir}", integration: "${integration}" },`;

	let result = contents.replace(CONFIG_ASSIGNMENT_PATTERN, (match) => {
		return `${match}\n\t${injection}`;
	});

	result = result.replace(CONFIG_PROPERTY_PATTERN, () => {
		return `config: {\n\t\t${injection}`;
	});

	result = result.replace(CONFIG_EXPORT_PATTERN, (match) => {
		return `${match}\n\t${injection}`;
	});

	result = result.replace(ECO_COMPONENT_PATTERN, (match) => {
		return `${match}\n\t${injection}`;
	});

	return result;
}

export default createEcoComponentMetaPlugin;
