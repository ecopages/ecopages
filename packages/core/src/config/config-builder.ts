/**
 * This module contains the ConfigBuilder class, which is used to build the EcoPagesAppConfig object.
 * @module
 */

import path from 'node:path';
import type { BunPlugin } from 'bun';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../constants.ts';
import { GHTML_PLUGIN_NAME, ghtmlPlugin } from '../integrations/ghtml/ghtml.plugin.ts';
import type { EcoPagesAppConfig, IncludesTemplates, RobotsPreference } from '../internal-types.ts';
import { createEcoComponentDirPlugin } from '../plugins/eco-component-dir-plugin.ts';
import type { IntegrationPlugin } from '../plugins/integration-plugin.ts';
import type { Processor } from '../plugins/processor.ts';
import type { PageMetadataProps } from '../public-types.ts';
import { invariant } from '../utils/invariant.ts';

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
		includesTemplates: {
			head: 'head.ghtml.ts',
			html: 'html.ghtml.ts',
			seo: 'seo.ghtml.ts',
		},
		error404Template: '404.ghtml.ts',
		robotsTxt: {
			preferences: {
				'*': [],
				Googlebot: ['/public/'],
			},
		},
		integrations: [],
		integrationsDependencies: [],
		distDir: '.eco',
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
	 * Sets the templates used for includes.
	 * These templates are used to build the HTML structure of pages.
	 *
	 * @param includesTemplates - An object containing the template file names
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setIncludesTemplates(includesTemplates: IncludesTemplates): this {
		this.config.includesTemplates = includesTemplates;
		return this;
	}

	/**
	 * Sets the template file for the 404 error page.
	 *
	 * @param error404Template - The file name of the 404 error template (default: '404.ghtml.ts')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setError404Template(error404Template: string): this {
		this.config.error404Template = error404Template;
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
	 * @param distDir - The distribution directory name (default: '.eco')
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setDistDir(distDir: string): this {
		this.config.distDir = distDir;
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
			throw new Error(`Processor with name "${processor.name}" already exists`);
		}
		this.config.processors.set(processor.name, processor);
		return this;
	}

	/**
	 * Sets the loaders to use for the application.
	 * This replaces any existing loaders.
	 *
	 * @param loaders - An array of Bun plugins to use as loaders
	 * @returns The ConfigBuilder instance for method chaining
	 */
	setLoaders(loaders: BunPlugin[]): this {
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
	 * @param loader - The Bun plugin to use as a loader
	 * @returns The ConfigBuilder instance for method chaining
	 * @throws Error if a loader with the same name already exists
	 */
	addLoader(name: string, loader: BunPlugin): this {
		if (this.config.loaders.has(name)) {
			throw new Error(`Loader with name "${name}" already exists`);
		}
		this.config.loaders.set(name, loader);
		return this;
	}

	private createAbsolutePaths(config: EcoPagesAppConfig): this {
		const {
			srcDir,
			componentsDir,
			includesDir,
			layoutsDir,
			pagesDir,
			publicDir,
			distDir,
			includesTemplates,
			error404Template,
		} = config;

		const projectDir = config.rootDir;

		const absoluteSrcDir = path.resolve(projectDir, srcDir);
		const absoluteDistDir = path.resolve(projectDir, distDir);

		this.config.absolutePaths = {
			config: path.join(projectDir, 'eco.config.ts'),
			projectDir: projectDir,
			srcDir: absoluteSrcDir,
			distDir: absoluteDistDir,
			componentsDir: path.join(absoluteSrcDir, componentsDir),
			includesDir: path.join(absoluteSrcDir, includesDir),
			layoutsDir: path.join(absoluteSrcDir, layoutsDir),
			pagesDir: path.join(absoluteSrcDir, pagesDir),
			publicDir: path.join(absoluteSrcDir, publicDir),
			htmlTemplatePath: path.join(absoluteSrcDir, includesDir, includesTemplates.html),
			error404TemplatePath: path.join(absoluteSrcDir, pagesDir, error404Template),
		};

		return this;
	}

	private createIntegrationTemplatesExt(integrations: EcoPagesAppConfig['integrations']) {
		const integrationName = integrations.map((integration) => integration.name);
		const uniqueName = new Set(integrationName);

		invariant(integrationName.length === uniqueName.size, 'Integrations names must be unique');

		const integrationsExtensions = integrations.flatMap((integration) => integration.extensions);
		const uniqueExtensions = new Set(integrationsExtensions);

		invariant(integrationsExtensions.length === uniqueExtensions.size, 'Integrations extensions must be unique');

		this.config.templatesExt = integrationsExtensions;
	}

	private initializeProcessors(): void {
		for (const processor of this.config.processors.values()) {
			processor.setContext(this.config);
		}
	}

	/**
	 * Initializes default loaders that are required for EcoPages to function.
	 * This includes the eco-component-dir-plugin which auto-injects componentDir into component configs.
	 */
	private async initializeDefaultLoaders(): Promise<void> {
		const componentDirPlugin = createEcoComponentDirPlugin({ config: this.config });
		if (!this.config.loaders.has(componentDirPlugin.name)) {
			this.config.loaders.set(componentDirPlugin.name, componentDirPlugin);
			await Bun.plugin(componentDirPlugin);
		}
	}

	private reviewBaseUrl(baseUrl: string): void {
		if (baseUrl) {
			this.config.baseUrl = baseUrl;
			return;
		}

		const envBaseUrl = import.meta.env.ECOPAGES_BASE_URL;

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

		this.createAbsolutePaths(this.config);
		this.createIntegrationTemplatesExt(this.config.integrations);

		await this.initializeDefaultLoaders();
		this.initializeProcessors();

		return this.config;
	}
}
