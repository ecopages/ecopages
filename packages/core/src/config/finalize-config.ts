import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import {
	collectConfiguredAppBuildManifestContributions,
	createBuildAdapter,
	setAppBuildAdapter,
	updateAppBuildManifest,
} from '../build/build-adapter.ts';
import { appLogger } from '../global/app-logger.ts';
import { HTML_PAGES_INTEGRATION_NAME } from '../html-pages/html-page-module.ts';
import { HtmlPagesPlugin } from '../html-pages/html-pages.plugin.ts';
import { createEcoComponentMetaTransform } from '../plugins/eco-component-meta-plugin.ts';
import type { AnyIntegrationPlugin } from '../plugins/integration-plugin.ts';
import {
	NoopEntrypointDependencyGraph,
	setAppEntrypointDependencyGraph,
} from '../services/runtime-state/entrypoint-dependency-graph.service.ts';
import {
	CounterServerInvalidationState,
	setAppServerInvalidationState,
} from '../services/runtime-state/server-invalidation-state.service.ts';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { invariant } from '../utils/invariant.ts';
import {
	DEFAULT_ECOPAGES_DIST_DIR,
	DEFAULT_ECOPAGES_HOSTNAME,
	DEFAULT_ECOPAGES_PORT,
	DEFAULT_ECOPAGES_WORK_DIR,
} from './constants.ts';
import { DEFAULT_ECO_CONFIG_FILENAME, resolveUserConfigRootDir } from './resolve-eco-config-path.ts';
import { validateRuntimeCapabilities } from './runtime-capability-validation.ts';
import type { EcoPagesUserConfig, FinalizeEcoPagesConfigOptions } from './user-config-types.ts';

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
	return baseUrl || process.env.ECOPAGES_BASE_URL || `http://${DEFAULT_ECOPAGES_HOSTNAME}:${DEFAULT_ECOPAGES_PORT}`;
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

/**
 * Resolves `dirPath/basename` against the registered template extensions.
 *
 * @remarks
 * When no file exists, the path uses the first extension so callers still get a
 * stable, non-existent candidate.
 *
 * @throws When more than one extension matches, such as `html.tsx` next to `html.html`.
 */
function resolveSemanticTemplatePath(dirPath: string, basename: string, extensions: string[]): string {
	const matches = extensions
		.map((extension) => path.join(dirPath, `${basename}${extension}`))
		.filter((candidate) => fileSystem.exists(candidate));

	invariant(matches.length <= 1, `Multiple ${basename} templates found: ${matches.join(', ')}`);
	return matches[0] ?? path.join(dirPath, `${basename}${extensions[0]}`);
}

function createAbsolutePaths(
	config: Omit<EcoPagesAppConfig, 'absolutePaths'>,
	configFilePath: string,
): EcoPagesAppConfig['absolutePaths'] {
	const srcDir = path.resolve(config.rootDir, config.srcDir);
	const includesDir = path.join(srcDir, config.includesDir);
	const pagesDir = path.join(srcDir, config.pagesDir);
	const errorPage = (status: number) => resolveSemanticTemplatePath(pagesDir, String(status), config.templatesExt);
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
		projectDir: config.rootDir,
		srcDir,
		distDir: path.resolve(config.rootDir, config.distDir),
		workDir: path.resolve(config.rootDir, config.workDir),
		componentsDir: path.join(srcDir, config.componentsDir),
		includesDir,
		layoutsDir: path.join(srcDir, config.layoutsDir),
		pagesDir,
		publicDir: path.join(srcDir, config.publicDir),
		htmlTemplatePath: resolveSemanticTemplatePath(includesDir, 'html', config.templatesExt),
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
 * 4. adds the component-meta source transform and hands each Processor the config,
 * 5. validates runtime capabilities,
 * 6. installs the app-owned build adapter, build manifest, and runtime state.
 *
 * Every call returns a new config; nothing is cached.
 *
 * App code never calls this: it exports `defineConfig(...)` and `createApp()` finalizes it.
 * The export exists for core's own callers, `@ecopages/testing`, and test fixtures, so keep
 * it out of user-facing docs.
 *
 * @internal
 *
 * @throws When `userConfig` is an already finalized config; when Integration names or
 * extensions, or Processor, loader, or source transform names, repeat; when a semantic
 * template matches more than one extension; or when a plugin's `runtimeCapability` is not met.
 */
export async function finalizeEcoPagesConfig(
	userConfig: EcoPagesUserConfig,
	options: FinalizeEcoPagesConfigOptions = {},
): Promise<EcoPagesAppConfig> {
	assertUserConfig(userConfig, options.configFilePath);
	const rootDir = resolveUserConfigRootDir(userConfig.rootDir, options.cwd);
	const integrations = withHtmlPagesIntegration(userConfig.integrations ?? []);
	const partialConfig: Omit<EcoPagesAppConfig, 'absolutePaths'> = {
		baseUrl: resolveBaseUrl(userConfig.baseUrl),
		rootDir,
		...resolveDirectories(userConfig),
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
		sourceTransforms: indexByName('Source transform', userConfig.sourceTransforms),
		additionalWatchPaths: userConfig.additionalWatchPaths ?? [],
		devPrewarmPaths: userConfig.devPrewarmPaths ?? [],
		devPrewarmBeforeReadyPaths: userConfig.devPrewarmBeforeReadyPaths ?? [],
		cache: userConfig.cache,
		devToolbar: userConfig.devToolbar,
		experimental: userConfig.experimental,
	};
	const config: EcoPagesAppConfig = {
		...partialConfig,
		absolutePaths: createAbsolutePaths(
			partialConfig,
			options.configFilePath ?? path.join(rootDir, DEFAULT_ECO_CONFIG_FILENAME),
		),
	};

	const componentMetaTransform = createEcoComponentMetaTransform({ config });
	if (!config.sourceTransforms.has(componentMetaTransform.name)) {
		config.sourceTransforms.set(componentMetaTransform.name, componentMetaTransform);
	}
	for (const processor of config.processors.values()) {
		processor.setContext(config);
	}
	validateRuntimeCapabilities(config);

	const buildOwnership = options.buildOwnership ?? userConfig.buildOwnership ?? 'rolldown';
	setAppBuildAdapter(config, createBuildAdapter({ ownership: buildOwnership }));
	updateAppBuildManifest(config, await collectConfiguredAppBuildManifestContributions(config));
	setAppServerInvalidationState(config, new CounterServerInvalidationState());
	setAppEntrypointDependencyGraph(config, new NoopEntrypointDependencyGraph());

	return config;
}
