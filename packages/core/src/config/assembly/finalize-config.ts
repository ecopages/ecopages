import path from 'node:path';
import { getEcopagesEnv } from '../../env.ts';
import { isPathInside } from '../../utils/path-containment.ts';
import { fileSystem } from '@ecopages/file-system';
import { createAppRuntime } from './app-runtime.ts';
import { appLogger } from '../../global/app-logger.ts';
import { HTML_PAGES_INTEGRATION_NAME } from '../../html-pages/html-page-module.ts';
import { HtmlPagesPlugin } from '../../html-pages/html-pages.plugin.ts';
import type { AnyIntegrationPlugin } from '../../plugins/integration-plugin.ts';
import type { EcoPagesAppConfig } from '../../config/internal-types.ts';
import { invariant } from '../../utils/invariant.ts';
import { ENDPOINT_FILE_EXTENSIONS, findEndpointFileExtension } from '../../utils/endpoint-file-extensions.ts';
import {
	DEFAULT_ECOPAGES_DIST_DIR,
	DEFAULT_ECOPAGES_HOSTNAME,
	DEFAULT_ECOPAGES_PORT,
	DEFAULT_ECOPAGES_WORK_DIR,
} from '../../constants.ts';
import { collectConfigModuleFiles } from '../config-module-files.ts';
import { DEFAULT_ECO_CONFIG_FILENAME, resolveUserConfigRootDir } from '../resolve-eco-config-path.ts';
import type { EcoPagesUserConfig, FinalizeEcoPagesConfigOptions } from '../user-config-types.ts';
import { listProductionServerModuleKeysFromDist } from '../../build/server/server-modules-manifest.ts';
import { toRootRelativePath } from '../../utils/root-relative-path.ts';
import { SERVER_BUNDLE_DIR } from '../../utils/resolve-entry-file.ts';

const finalizedPluginInstances = new WeakSet<object>();

/**
 * Rejects values that are not a `defineConfig(...)` object.
 *
 * @remarks
 * Plain JavaScript configs bypass the parameter type, and an already finalized config or
 * the earlier `{ config, configFilePath }` argument would otherwise be finalized with
 * silent defaults or fail far from the cause.
 */
function assertUserConfig(userConfig: EcoPagesUserConfig, configFilePath: string | undefined): void {
	if (userConfig.processors instanceof Map || 'absolutePaths' in userConfig) {
		const source = configFilePath ? ` from ${configFilePath}` : '';
		throw new Error(
			`Expected a defineConfig(...) object but received an already finalized app config${source}. Export defineConfig(...) from eco.config.ts and let createApp() finalize it.`,
		);
	}

	if ('configFilePath' in userConfig) {
		throw new Error(
			'finalizeEcoPagesConfig() takes the user config first: finalizeEcoPagesConfig(userConfig, { configFilePath }).',
		);
	}
}

/**
 * Treats an emitted `dist/.server/eco.config.mjs` as living under the deploy root.
 *
 * @remarks
 * Production no longer rewrites `import.meta` to the source config, so the
 * emitted file's directory is `dist/.server/`. The app root is the directory
 * that contains `dist/`, taken from the config path so a worker that reloads
 * the emitted file does not need `process.cwd()` to be the deploy root.
 */
function resolveEmittedConfigRootDir(
	rootDir: string,
	configFilePath: string,
	distDirName: string,
	cwd: string,
): string {
	const resolvedConfig = path.resolve(configFilePath);
	const serverDir = path.dirname(resolvedConfig);
	if (path.basename(serverDir) === SERVER_BUNDLE_DIR) {
		const emittedDistDir = path.dirname(serverDir);
		const normalizedDistDir = path.normalize(distDirName);
		const distSegments = normalizedDistDir.split(/[\\/]/u).filter((segment) => segment !== '' && segment !== '.');
		const deployRoot = path.resolve(emittedDistDir, ...distSegments.map(() => '..'));
		if (path.resolve(deployRoot, distDirName) === emittedDistDir) {
			return deployRoot;
		}
	}
	const distCandidates = [path.resolve(cwd, distDirName), path.resolve(rootDir, distDirName)];
	const isEmitted = distCandidates.some((candidate) => isPathInside(resolvedConfig, candidate));
	if (!isEmitted) {
		return rootDir;
	}
	if (distCandidates.some((candidate) => isPathInside(rootDir, candidate) || rootDir === candidate)) {
		return cwd;
	}
	return rootDir;
}

/** An empty string keeps the default, as an omitted field does. */
function resolveDirectories(userConfig: EcoPagesUserConfig) {
	return {
		srcDir: userConfig.srcDir || 'src',
		pagesDir: userConfig.pagesDir || 'pages',
		includesDir: userConfig.includesDir || 'includes',
		componentsDir: userConfig.componentsDir || 'components',
		layoutsDir: userConfig.layoutsDir || 'layouts',
		publicDir: userConfig.publicDir || 'public',
		distDir: userConfig.distDir || DEFAULT_ECOPAGES_DIST_DIR,
		workDir: userConfig.workDir || DEFAULT_ECOPAGES_WORK_DIR,
	};
}

function resolveBaseUrl(baseUrl: string | undefined): string {
	return (
		baseUrl || getEcopagesEnv('ECOPAGES_BASE_URL') || `http://${DEFAULT_ECOPAGES_HOSTNAME}:${DEFAULT_ECOPAGES_PORT}`
	);
}

function resolveSitemap(sitemap: EcoPagesUserConfig['sitemap']): EcoPagesAppConfig['sitemap'] {
	return {
		enabled: false,
		fileName: 'sitemap.xml',
		...sitemap,
		extraUrls: sitemap?.extraUrls ?? [],
		exclude: sitemap?.exclude ?? [],
	};
}

/**
 * Appends the core HTML Pages Integration unless a user Integration owns `.html`.
 *
 * @remarks
 * It goes last so the first-extension fallback for missing semantic templates,
 * and the shell resolution order of existing apps, stay unchanged.
 */
function withHtmlPagesIntegration(integrations: AnyIntegrationPlugin[]): AnyIntegrationPlugin[] {
	if (integrations.some((integration) => integration.extensions.includes('.html'))) {
		return integrations;
	}

	return [...integrations, new HtmlPagesPlugin()];
}

function findDuplicate(values: string[]): string | undefined {
	const seen = new Set<string>();
	for (const value of values) {
		if (seen.has(value)) return value;
		seen.add(value);
	}
	return undefined;
}

function collectTemplateExtensions(integrations: AnyIntegrationPlugin[]): string[] {
	const names = new Set(integrations.map((integration) => integration.name));
	const duplicateName = findDuplicate(integrations.map((integration) => integration.name));
	invariant(
		duplicateName === undefined,
		`Integration names must be unique: "${duplicateName}" is registered twice.${
			duplicateName === HTML_PAGES_INTEGRATION_NAME
				? ` Core registers "${HTML_PAGES_INTEGRATION_NAME}" for .html Pages unless an Integration owns .html; rename yours.`
				: ''
		}`,
	);

	if (names.has('kitajs') && names.has('react')) {
		appLogger.debug(
			'Both kitajs and react integrations are enabled. Use per-file JSX import source/pragma consistently (e.g. `/** @jsxImportSource react */` for React files and `/** @jsxImportSource @kitajs/html */` for Kita files).',
		);
	}

	for (const integration of integrations) {
		const reserved = integration.extensions.find((extension) => findEndpointFileExtension(extension));
		invariant(
			reserved === undefined,
			`Integration "${integration.name}" registers "${reserved}", which is reserved for endpoint files: ${ENDPOINT_FILE_EXTENSIONS.join(', ')}.`,
		);
	}

	const extensions = integrations.flatMap((integration) => integration.extensions);
	const duplicateExtension = findDuplicate(extensions);
	invariant(
		duplicateExtension === undefined,
		`Integration extensions must be unique: "${duplicateExtension}" is registered by more than one Integration.`,
	);
	return extensions;
}

function indexByName<T extends { name: string }>(kind: string, items: T[] | undefined): Map<string, T> {
	const index = new Map<string, T>();
	for (const item of items ?? []) {
		if (index.has(item.name)) {
			throw new Error(`${kind} with name "${item.name}" already exists`);
		}
		index.set(item.name, item);
	}
	return index;
}

function getPluginInstances(userConfig: EcoPagesUserConfig): object[] {
	const pluginInstances = new Set<object>();
	for (const plugin of [
		...(userConfig.integrations ?? []),
		...(userConfig.processors ?? []),
		...(userConfig.loaders ?? []),
	]) {
		if ((typeof plugin === 'object' && plugin !== null) || typeof plugin === 'function') {
			pluginInstances.add(plugin);
		}
	}
	return [...pluginInstances];
}

/**
 * Resolves `dirPath/basename` against the registered template extensions.
 *
 * @remarks
 * A file on disk wins. When none exists, a unique recorded source key in
 * `dist/.server/server-modules.json` is the production template, so
 * `ecopages start` from a copied `dist/` still finds `404.html` instead of the
 * first Integration extension. Otherwise the path uses the first extension so
 * callers still get a stable, non-existent candidate.
 *
 * @throws When more than one extension matches, such as `html.tsx` next to `html.html`.
 */
function resolveSemanticTemplatePath(
	dirPath: string,
	basename: string,
	extensions: string[],
	rootDir: string,
	distDir: string,
): string {
	const candidates = extensions.map((extension) => path.join(dirPath, `${basename}${extension}`));
	const matches = candidates.filter((candidate) => fileSystem.exists(candidate));

	invariant(matches.length <= 1, `Multiple ${basename} templates found: ${matches.join(', ')}`);
	if (matches[0]) {
		return matches[0];
	}

	const recordedKeys = listProductionServerModuleKeysFromDist(rootDir, distDir) ?? [];
	const recorded = candidates
		.map((candidate) => toRootRelativePath(rootDir, candidate))
		.filter((key) => recordedKeys.includes(key));
	invariant(
		recorded.length <= 1,
		`Multiple ${basename} templates found in the production map: ${recorded.join(', ')}`,
	);
	if (recorded[0]) {
		return path.resolve(rootDir, recorded[0]);
	}

	return path.join(dirPath, `${basename}${extensions[0]}`);
}

/**
 * @remarks
 * Scans only a config module loaded from source. The emitted production config under `distDir` is a bundle
 * that no build cache reads, and an in-memory config has no file to scan.
 */
async function resolveConfigModuleFiles(
	configFilePath: string,
	loadedFromFile: boolean,
	rootDir: string,
	distDir: string,
): Promise<string[]> {
	const isEmittedConfig = isPathInside(path.resolve(configFilePath), path.resolve(rootDir, distDir));
	if (!loadedFromFile || isEmittedConfig || !fileSystem.exists(configFilePath)) {
		return [configFilePath];
	}
	return await collectConfigModuleFiles(configFilePath, rootDir);
}

function createAbsolutePaths(
	config: Omit<EcoPagesAppConfig, 'absolutePaths'>,
	configFilePath: string,
	configModuleFiles: string[],
): EcoPagesAppConfig['absolutePaths'] {
	const srcDir = path.resolve(config.rootDir, config.srcDir);
	const includesDir = path.join(srcDir, config.includesDir);
	const pagesDir = path.join(srcDir, config.pagesDir);
	const errorPage = (status: number) =>
		resolveSemanticTemplatePath(pagesDir, String(status), config.templatesExt, config.rootDir, config.distDir);
	const errorPageTemplatePaths = {
		400: errorPage(400),
		401: errorPage(401),
		403: errorPage(403),
		404: errorPage(404),
		409: errorPage(409),
		500: errorPage(500),
	};

	return {
		config: configFilePath,
		configModuleFiles,
		projectDir: config.rootDir,
		srcDir,
		distDir: path.resolve(config.rootDir, config.distDir),
		workDir: path.resolve(config.rootDir, config.workDir),
		componentsDir: path.join(srcDir, config.componentsDir),
		includesDir,
		layoutsDir: path.join(srcDir, config.layoutsDir),
		pagesDir,
		publicDir: path.join(srcDir, config.publicDir),
		htmlTemplatePath: resolveSemanticTemplatePath(
			includesDir,
			'html',
			config.templatesExt,
			config.rootDir,
			config.distDir,
		),
		errorPageTemplatePaths,
		error404TemplatePath: errorPageTemplatePaths[404],
		error500TemplatePath: errorPageTemplatePaths[500],
	};
}

/**
 * Turns an `eco.config.ts` user config into the app config that every runtime path consumes.
 *
 * @remarks
 * This is the only finalization path; {@link loadEcoPagesConfig} and `createApp()` both
 * end here. In order, it:
 *
 * 1. applies defaults (`baseUrl` falls back to `ECOPAGES_BASE_URL`, then `http://localhost:3000`),
 * 2. appends the HTML Pages Integration and rejects duplicate Integration names and extensions,
 * 3. resolves absolute paths, including the semantic `html.*` and error-page templates,
 * 4. assembles one app runtime on the config, with the app-owned build adapter, build manifest, and
 *    build queue.
 *
 * Every call returns a new config; nothing is cached.
 *
 * App code never calls this: it exports `defineConfig(...)` and `createApp()` finalizes it.
 * Workspace packages and tests import it from `@ecopages/core/config`. That subpath is published, but
 * keep this function out of user-facing docs.
 *
 * @throws When `userConfig` is an already finalized config; when Integration names or
 * extensions, or Processor or loader names, repeat; when a semantic
 * template matches more than one extension.
 */
export async function finalizeEcoPagesConfig(
	userConfig: EcoPagesUserConfig,
	options: FinalizeEcoPagesConfigOptions = {},
): Promise<EcoPagesAppConfig> {
	assertUserConfig(userConfig, options.configFilePath);
	const pluginInstances = getPluginInstances(userConfig);
	if (pluginInstances.some((plugin) => finalizedPluginInstances.has(plugin))) {
		const source = options.configFilePath ? ` at ${options.configFilePath}` : '';
		throw new Error(
			`Ecopages config${source} reused plugin instances for another app. Export defineConfig(() => ({ ... })) so each app receives fresh integrations, processors, and loaders.`,
		);
	}
	for (const plugin of pluginInstances) finalizedPluginInstances.add(plugin);

	try {
		const cwd = options.cwd ?? process.cwd();
		const directories = resolveDirectories(userConfig);
		let rootDir = resolveUserConfigRootDir(userConfig.rootDir, cwd);
		const configFilePath = options.configFilePath ?? path.join(rootDir, DEFAULT_ECO_CONFIG_FILENAME);
		rootDir = resolveEmittedConfigRootDir(rootDir, configFilePath, directories.distDir, cwd);
		const integrations = withHtmlPagesIntegration(userConfig.integrations ?? []);
		const partialConfig: Omit<EcoPagesAppConfig, 'absolutePaths'> = {
			baseUrl: resolveBaseUrl(userConfig.baseUrl),
			rootDir,
			...directories,
			robotsTxt: userConfig.robotsTxt ?? { preferences: { '*': [] } },
			sitemap: resolveSitemap(userConfig.sitemap),
			defaultMetadata: {
				title: 'Ecopages',
				description: 'This is a static site generated with Ecopages',
				...userConfig.defaultMetadata,
			},
			integrations,
			templatesExt: collectTemplateExtensions(integrations),
			processors: indexByName('Processor', userConfig.processors),
			loaders: indexByName('Loader', userConfig.loaders),
			additionalWatchPaths: userConfig.additionalWatchPaths ?? [],
			devPrewarmPaths: userConfig.devPrewarmPaths ?? [],
			serverFiles: userConfig.serverFiles,
			cache: userConfig.cache,
			devToolbar: userConfig.devToolbar,
		};
		const config: EcoPagesAppConfig = {
			...partialConfig,
			absolutePaths: createAbsolutePaths(
				partialConfig,
				configFilePath,
				await resolveConfigModuleFiles(
					configFilePath,
					options.configFilePath !== undefined,
					rootDir,
					partialConfig.distDir,
				),
			),
		};

		createAppRuntime(config);

		return config;
	} catch (error) {
		for (const plugin of pluginInstances) finalizedPluginInstances.delete(plugin);
		throw error;
	}
}
