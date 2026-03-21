/**
 * This module contains the ConfigBuilder class, which is used to build the EcoPagesAppConfig object.
 * @module
 */

import path from 'node:path';
import {
	DEFAULT_ECOPAGES_DIST_DIR,
	DEFAULT_ECOPAGES_HOSTNAME,
	DEFAULT_ECOPAGES_PORT,
	DEFAULT_ECOPAGES_WORK_DIR,
} from '../constants.ts';
import {
	collectConfiguredAppBuildManifestContributions,
	createBuildAdapter,
	getAppServerBuildPlugins,
	setAppBuildAdapter,
	setAppBuildExecutor,
	updateAppBuildManifest,
} from '../build/build-adapter.ts';
import type { EcoBuildPlugin } from '../build/build-types.ts';
import { createAppBuildExecutor } from '../build/dev-build-coordinator.ts';
import { GHTML_PLUGIN_NAME, ghtmlPlugin } from '../integrations/ghtml/ghtml.plugin.ts';
import type { EcoPagesAppConfig, RobotsPreference } from '../internal-types.ts';
import { createEcoComponentMetaPlugin } from '../plugins/eco-component-meta-plugin.ts';
import type { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { Processor } from '../plugins/processor.ts';
import type { RuntimeCapabilityDeclaration, RuntimeCapabilityTag } from '../plugins/runtime-capability.ts';
import type { PageMetadataProps } from '../public-types.ts';
import type { CacheConfig } from '../services/cache/cache.types.ts';
import { NoopDevGraphService, setAppDevGraphService } from '../services/dev-graph.service.ts';
import { createNodeRuntimeManifest, setAppNodeRuntimeManifest } from '../services/node-runtime-manifest.service.ts';
import {
	InMemoryRuntimeSpecifierRegistry,
	setAppRuntimeSpecifierRegistry,
} from '../services/runtime-specifier-registry.service.ts';
import { invariant } from '../utils/invariant.ts';
import { appLogger } from '../global/app-logger.ts';
import { fileSystem } from '@ecopages/file-system';

export const CONFIG_BUILDER_ERRORS = {
	DUPLICATE_INTEGRATION_NAMES: 'Integrations names must be unique',
	DUPLICATE_INTEGRATION_EXTENSIONS: 'Integrations extensions must be unique',
	MIXED_JSX_ENGINES:
		'Both kitajs and react integrations are enabled. Use per-file JSX import source/pragma consistently (e.g. `/** @jsxImportSource react */` for React files and `/** @jsxImportSource @kitajs/html */` for Kita files).',
	duplicateProcessorName: (name: string) => `Processor with name "${name}" already exists`,
	duplicateLoaderName: (name: string) => `Loader with name "${name}" already exists`,
	duplicateSemanticTemplate: (kind: 'html' | '404', matches: string[]) =>
		`Multiple ${kind} templates found: ${matches.join(', ')}`,
	incompatibleRuntimeCapability: (
		kind: 'integration' | 'processor',
		name: string,
		runtime: RuntimeKind,
		reason: string,
	) => `Cannot enable ${kind} "${name}" on ${runtime}: ${reason}`,
	unsupportedRuntimeVersion: (
		kind: 'integration' | 'processor',
		name: string,
		runtime: RuntimeKind,
		current: string,
		min: string,
	) => `Cannot enable ${kind} "${name}" on ${runtime} ${current}: requires runtime version ${min} or newer`,
	invalidRuntimeVersion: (kind: 'integration' | 'processor', name: string, version: string) =>
		`Cannot validate ${kind} "${name}" runtimeCapability.minRuntimeVersion "${version}" because it is not a dot-separated numeric version`,
} as const;

type RuntimeKind = 'node' | 'bun';

type RuntimeEnvironment = {
	runtime: RuntimeKind;
	version: string;
	supportedTags: Set<RuntimeCapabilityTag>;
};

type RuntimeCapabilityOwner = {
	kind: 'integration' | 'processor';
	name: string;
	runtimeCapability?: RuntimeCapabilityDeclaration;
};

/**
 * A builder class for creating and configuring EcoPages application configuration.
 * Provides a fluent interface for setting various configuration options and managing
 * application settings.
 *
 * @example
 * ```typescript
 * const config = new ConfigBuilder()
 *   .setBaseUrl('https://example.com')
 *   .setRootDir('./myproject')
 *   .setSrcDir('source')
 *   .build();
 * ```
 *
 * @remarks
 * The ConfigBuilder follows the builder pattern and allows for:
 * - Setting directory paths for various components (pages, includes, layouts, etc.)
 * - Configuring templates and includes
 * - Managing integrations and plugins
 * - Setting up processors and loaders
 * - Configuring API handlers
 * - Managing metadata and robots.txt preferences
 *
 * All setter methods return the instance of the builder for method chaining.
 * The configuration is finalized by calling the `build()` method, which performs
 * validation and initialization of the configuration.
 *
 * @throws {Error} When building configuration without required fields (e.g., baseUrl)
 * @throws {Error} When adding duplicate processors or loaders
 */
export class ConfigBuilder {
	public config: EcoPagesAppConfig = {
		baseUrl: '',
		rootDir: '.',
		srcDir: 'src',
		pagesDir: 'pages',
		includesDir: 'includes',
		componentsDir: 'components',
		layoutsDir: 'layouts',
		publicDir: 'public',
		robotsTxt: {
			preferences: {
				'*': [],
			},
		},
		integrations: [],
		integrationsDependencies: [],
		distDir: DEFAULT_ECOPAGES_DIST_DIR,
		defaultMetadata: {
			title: 'Ecopages',
			description: 'This is a static site generated with Ecopages',
		},
		additionalWatchPaths: [],
		templatesExt: [],
		absolutePaths: {
			config: '',
			componentsDir: '',
			distDir: '',
			workDir: '',
			includesDir: '',
			layoutsDir: '',
			pagesDir: '',
			projectDir: '',
			publicDir: '',
			srcDir: '',
			htmlTemplatePath: '',
			error404TemplatePath: '',
		},
		processors: new Map(),
		loaders: new Map(),
		workDir: DEFAULT_ECOPAGES_WORK_DIR,
	};

	/**
	 * Sets the base URL for the application.
	 * This URL is used as the root URL for all pages and assets.
	 *
	 * @param baseUrl - The base URL for the application (e.g., 'https://example.com')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setBaseUrl(baseUrl: string): this {
		this.config.baseUrl = baseUrl;
		return this;
	}

	/**
	 * Sets the root directory of the project.
	 * This is the base directory from which all other paths are resolved.
	 *
	 * @param rootDir - The root directory path
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setRootDir(rootDir: string): this {
		this.config.rootDir = rootDir;
		return this;
	}

	/**
	 * Sets the source directory relative to the root directory.
	 * This directory contains all the source files for the application.
	 *
	 * @param srcDir - The source directory name (default: 'src')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setSrcDir(srcDir: string): this {
		this.config.srcDir = srcDir;
		return this;
	}

	/**
	 * Sets the pages directory relative to the source directory.
	 * This directory contains all the page files for the application.
	 *
	 * @param pagesDir - The pages directory name (default: 'pages')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setPagesDir(pagesDir: string): this {
		this.config.pagesDir = pagesDir;
		return this;
	}

	/**
	 * Sets the includes directory relative to the source directory.
	 * This directory contains template includes and partials.
	 *
	 * @param includesDir - The includes directory name (default: 'includes')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setIncludesDir(includesDir: string): this {
		this.config.includesDir = includesDir;
		return this;
	}

	/**
	 * Sets the components directory relative to the source directory.
	 * This directory contains reusable components.
	 *
	 * @param componentsDir - The components directory name (default: 'components')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setComponentsDir(componentsDir: string): this {
		this.config.componentsDir = componentsDir;
		return this;
	}

	/**
	 * Sets the layouts directory relative to the source directory.
	 * This directory contains layout templates.
	 *
	 * @param layoutsDir - The layouts directory name (default: 'layouts')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setLayoutsDir(layoutsDir: string): this {
		this.config.layoutsDir = layoutsDir;
		return this;
	}

	/**
	 * Sets the public directory relative to the source directory.
	 * This directory contains static assets that should be served as-is.
	 *
	 * @param publicDir - The public directory name (default: 'public')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setPublicDir(publicDir: string): this {
		this.config.publicDir = publicDir;
		return this;
	}

	/**
	 * Sets the robots.txt configuration.
	 * This determines which paths are allowed/disallowed for search engines.
	 *
	 * @param robotsTxt - The robots.txt configuration object
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setRobotsTxt(robotsTxt: { preferences: RobotsPreference }): this {
		this.config.robotsTxt = robotsTxt;
		return this;
	}

	/**
	 * Sets the integration plugins to use.
	 * These plugins provide additional functionality to the application.
	 *
	 * @param integrations - An array of integration plugins
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setIntegrations(integrations: IntegrationPlugin<unknown>[]): this {
		this.config.integrations = integrations;
		return this;
	}

	/**
	 * Sets the output directory for the built application.
	 *
	 * @param distDir - The distribution directory name (default: 'dist')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setDistDir(distDir: string): this {
		this.config.distDir = distDir;
		return this;
	}

	/**
	 * Sets the internal work directory for runtime-only artifacts.
	 *
	 * @remarks
	 * Use this when deployable output should stay clean while Ecopages still
	 * needs a separate workspace for server transpilation caches, runtime
	 * manifests, and other internal build products.
	 *
	 * @param workDir - The internal work directory name
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setWorkDir(workDir: string): this {
		this.config.workDir = workDir;
		return this;
	}

	/**
	 * Sets the default metadata for pages.
	 * This is used when a page doesn't specify its own metadata.
	 *
	 * @param defaultMetadata - The default metadata object
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setDefaultMetadata(defaultMetadata: PageMetadataProps): this {
		this.config.defaultMetadata = {
			...this.config.defaultMetadata,
			...defaultMetadata,
		};
		return this;
	}

	/**
	 * Sets additional paths to watch for changes during development.
	 *
	 * @param additionalWatchPaths - An array of additional paths to watch
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setAdditionalWatchPaths(additionalWatchPaths: string[]): this {
		this.config.additionalWatchPaths = additionalWatchPaths;
		return this;
	}

	/**
	 * Sets the processors to use for the application.
	 * This replaces any existing processors.
	 *
	 * @param processors - An array of processors
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setProcessors(processors: Processor<any>[]): this {
		this.config.processors.clear();
		for (const processor of processors) {
			this.addProcessor(processor);
		}
		return this;
	}

	/**
	 * Adds a processor to the application.
	 *
	 * @param processor - The processor to add
	 * @returns The ConfigBuilder instance for method chaining
	 * @throws Error if a processor with the same name already exists
	 */
	addProcessor(processor: Processor): this {
		if (this.config.processors.has(processor.name)) {
			throw new Error(CONFIG_BUILDER_ERRORS.duplicateProcessorName(processor.name));
		}
		this.config.processors.set(processor.name, processor);
		return this;
	}

	/**
	 * Sets the loaders to use for the application.
	 * This replaces any existing loaders.
	 *
	 * @param loaders - An array of build plugins to use as loaders
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setLoaders(loaders: EcoBuildPlugin[]): this {
		this.config.loaders.clear();
		for (const loader of loaders) {
			this.addLoader(loader.name, loader);
		}
		return this;
	}

	/**
	 * Adds a loader to the application.
	 *
	 * @param name - The name of the loader
	 * @param loader - The build plugin to use as a loader
	 * @returns The ConfigBuilder instance for method chaining
	 * @throws Error if a loader with the same name already exists
	 */
	addLoader(name: string, loader: EcoBuildPlugin): this {
		if (this.config.loaders.has(name)) {
			throw new Error(CONFIG_BUILDER_ERRORS.duplicateLoaderName(name));
		}
		this.config.loaders.set(name, loader);
		return this;
	}

	/**
	 * Sets the cache configuration for ISR and page caching.
	 *
	 * @param cacheConfig - The cache configuration object
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setCacheConfig(cacheConfig: CacheConfig): this {
		this.config.cache = cacheConfig;
		return this;
	}

	setExperimental(experimental: NonNullable<EcoPagesAppConfig['experimental']>): this {
		this.config.experimental = experimental;
		return this;
	}

	private createAbsolutePaths(config: EcoPagesAppConfig): this {
		const { srcDir, componentsDir, includesDir, layoutsDir, pagesDir, publicDir, distDir, workDir } = config;

		const projectDir = config.rootDir;

		const absoluteSrcDir = path.resolve(projectDir, srcDir);
		const absoluteDistDir = path.resolve(projectDir, distDir);
		const absoluteWorkDir = path.resolve(projectDir, workDir);

		const absoluteIncludesDir = path.join(absoluteSrcDir, includesDir);
		const absolutePagesDir = path.join(absoluteSrcDir, pagesDir);

		this.config.absolutePaths = {
			config: path.join(projectDir, 'eco.config.ts'),
			projectDir: projectDir,
			srcDir: absoluteSrcDir,
			distDir: absoluteDistDir,
			workDir: absoluteWorkDir,
			componentsDir: path.join(absoluteSrcDir, componentsDir),
			includesDir: absoluteIncludesDir,
			layoutsDir: path.join(absoluteSrcDir, layoutsDir),
			pagesDir: absolutePagesDir,
			publicDir: path.join(absoluteSrcDir, publicDir),
			htmlTemplatePath: this.resolveSemanticTemplatePath({
				dirPath: absoluteIncludesDir,
				basename: 'html',
			}),
			error404TemplatePath: this.resolveSemanticTemplatePath({
				dirPath: absolutePagesDir,
				basename: '404',
			}),
		};

		return this;
	}

	private resolveSemanticTemplatePath({ dirPath, basename }: { dirPath: string; basename: 'html' | '404' }): string {
		const extensions = this.config.templatesExt.length > 0 ? this.config.templatesExt : ['.ghtml.ts'];
		const matches = extensions
			.map((extension) => path.join(dirPath, `${basename}${extension}`))
			.filter((candidate) => fileSystem.exists(candidate));

		invariant(matches.length <= 1, CONFIG_BUILDER_ERRORS.duplicateSemanticTemplate(basename, matches));

		if (matches.length === 1) {
			return matches[0]!;
		}

		return path.join(dirPath, `${basename}${extensions[0]}`);
	}

	private createIntegrationTemplatesExt(integrations: EcoPagesAppConfig['integrations']) {
		const integrationName = integrations.map((integration) => integration.name);
		const uniqueName = new Set(integrationName);

		invariant(integrationName.length === uniqueName.size, CONFIG_BUILDER_ERRORS.DUPLICATE_INTEGRATION_NAMES);

		const hasKitaJs = uniqueName.has('kitajs');
		const hasReact = uniqueName.has('react');
		if (hasKitaJs && hasReact) {
			appLogger.warn(CONFIG_BUILDER_ERRORS.MIXED_JSX_ENGINES);
		}

		const integrationsExtensions = integrations.flatMap((integration) => integration.extensions);
		const uniqueExtensions = new Set(integrationsExtensions);

		invariant(
			integrationsExtensions.length === uniqueExtensions.size,
			CONFIG_BUILDER_ERRORS.DUPLICATE_INTEGRATION_EXTENSIONS,
		);

		this.config.templatesExt = integrationsExtensions;
	}

	private initializeProcessors(): void {
		for (const processor of this.config.processors.values()) {
			processor.setContext(this.config);
		}
	}

	private validateRuntimeCapabilities(): void {
		const runtimeEnvironment = this.detectRuntimeEnvironment();
		const contributors: RuntimeCapabilityOwner[] = [
			...this.config.integrations.map((integration) => ({
				kind: 'integration' as const,
				name: integration.name,
				runtimeCapability: integration.runtimeCapability,
			})),
			...Array.from(this.config.processors.values(), (processor) => ({
				kind: 'processor' as const,
				name: processor.name,
				runtimeCapability: processor.runtimeCapability,
			})),
		];

		for (const contributor of contributors) {
			this.validateRuntimeCapability(contributor, runtimeEnvironment);
		}
	}

	private validateRuntimeCapability(contributor: RuntimeCapabilityOwner, environment: RuntimeEnvironment): void {
		const declaration = contributor.runtimeCapability;
		if (!declaration) {
			return;
		}

		for (const tag of declaration.tags) {
			if (environment.supportedTags.has(tag)) {
				continue;
			}

			throw new Error(
				CONFIG_BUILDER_ERRORS.incompatibleRuntimeCapability(
					contributor.kind,
					contributor.name,
					environment.runtime,
					this.describeUnsupportedRuntimeTag(tag),
				),
			);
		}

		if (!declaration.minRuntimeVersion) {
			return;
		}

		const minVersion = this.parseVersion(declaration.minRuntimeVersion);
		if (!minVersion) {
			throw new Error(
				CONFIG_BUILDER_ERRORS.invalidRuntimeVersion(
					contributor.kind,
					contributor.name,
					declaration.minRuntimeVersion,
				),
			);
		}

		const currentVersion = this.parseVersion(environment.version);
		if (!currentVersion) {
			return;
		}

		if (this.compareVersions(currentVersion, minVersion) >= 0) {
			return;
		}

		throw new Error(
			CONFIG_BUILDER_ERRORS.unsupportedRuntimeVersion(
				contributor.kind,
				contributor.name,
				environment.runtime,
				environment.version,
				declaration.minRuntimeVersion,
			),
		);
	}

	private detectRuntimeEnvironment(): RuntimeEnvironment {
		const bunVersion = this.getBunVersion();
		if (bunVersion) {
			return {
				runtime: 'bun',
				version: bunVersion,
				supportedTags: new Set<RuntimeCapabilityTag>([
					'bun-only',
					'node-compatible',
					'requires-native-bun-api',
					'requires-node-builtins',
				]),
			};
		}

		return {
			runtime: 'node',
			version: process.versions.node,
			supportedTags: new Set<RuntimeCapabilityTag>(['node-compatible', 'requires-node-builtins']),
		};
	}

	private getBunVersion(): string | undefined {
		const bun = globalThis as typeof globalThis & {
			Bun?: {
				version?: string;
			};
		};

		return typeof bun.Bun?.version === 'string' ? bun.Bun.version : undefined;
	}

	private describeUnsupportedRuntimeTag(tag: RuntimeCapabilityTag): string {
		switch (tag) {
			case 'bun-only':
				return 'it is Bun-only';
			case 'requires-native-bun-api':
				return 'it requires the native Bun API';
			case 'requires-node-builtins':
				return 'it requires Node builtins';
			case 'node-compatible':
				return 'it requires a Node-compatible runtime';
		}
	}

	private parseVersion(version: string): number[] | undefined {
		const normalized = version.trim().replace(/^v/i, '');
		if (!/^\d+(?:\.\d+)*$/.test(normalized)) {
			return undefined;
		}

		return normalized.split('.').map((segment) => Number(segment));
	}

	private compareVersions(left: number[], right: number[]): number {
		const maxLength = Math.max(left.length, right.length);
		for (let index = 0; index < maxLength; index += 1) {
			const leftValue = left[index] ?? 0;
			const rightValue = right[index] ?? 0;

			if (leftValue > rightValue) {
				return 1;
			}

			if (leftValue < rightValue) {
				return -1;
			}
		}

		return 0;
	}

	/**
	 * Initializes default loaders that are required for EcoPages to function.
	 * This includes the eco-component-meta-plugin which auto-injects __eco metadata into component configs.
	 */
	private async initializeDefaultLoaders(): Promise<void> {
		const componentMetaPlugin = createEcoComponentMetaPlugin({ config: this.config });
		if (!this.config.loaders.has(componentMetaPlugin.name)) {
			this.config.loaders.set(componentMetaPlugin.name, componentMetaPlugin);
		}
	}

	private reviewBaseUrl(baseUrl: string): void {
		if (baseUrl) {
			this.config.baseUrl = baseUrl;
			return;
		}

		const envBaseUrl = process.env.ECOPAGES_BASE_URL;

		if (envBaseUrl) {
			this.config.baseUrl = envBaseUrl;
		} else if (!this.config.baseUrl) {
			this.config.baseUrl = `http://${DEFAULT_ECOPAGES_HOSTNAME}:${DEFAULT_ECOPAGES_PORT}`;
		}
	}

	/**
	 * Builds and returns the final configuration object.
	 * This performs validation and initialization of the configuration.
	 *
	 * @returns A promise that resolves to the final EcoPagesAppConfig
	 * @throws Error if required configuration is missing (e.g., baseUrl)
	 */
	async build(): Promise<EcoPagesAppConfig> {
		this.reviewBaseUrl(this.config.baseUrl);

		if (!this.config.integrations.some((integration) => integration.name === GHTML_PLUGIN_NAME)) {
			this.config.integrations.push(ghtmlPlugin());
		}

		this.createIntegrationTemplatesExt(this.config.integrations);
		this.createAbsolutePaths(this.config);

		await this.initializeDefaultLoaders();
		this.initializeProcessors();
		this.validateRuntimeCapabilities();
		const buildAdapter = createBuildAdapter();
		setAppBuildAdapter(this.config, buildAdapter);
		updateAppBuildManifest(this.config, await collectConfiguredAppBuildManifestContributions(this.config));
		setAppDevGraphService(this.config, new NoopDevGraphService());
		setAppRuntimeSpecifierRegistry(this.config, new InMemoryRuntimeSpecifierRegistry());
		setAppBuildExecutor(
			this.config,
			createAppBuildExecutor({
				development: false,
				adapter: buildAdapter,
				getPlugins: () => getAppServerBuildPlugins(this.config),
			}),
		);
		setAppNodeRuntimeManifest(this.config, createNodeRuntimeManifest(this.config));

		return this.config;
	}
}
