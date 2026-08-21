/**
 * ContentProcessorPlugin
 * @module @ecopages/content-processor
 */

import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import {
	mergeProcessorOptions,
	Processor,
	resolveGeneratedPath,
	writeGeneratedTypesPackage,
	type EcoBuildPlugin,
	type ProcessorConfig,
	type ProcessorWatchConfig,
} from '@ecopages/core/plugins/processor';
import { Logger } from '@ecopages/logger';
import {
	renderCollectionComponentsModule,
	renderCollectionBrowserModule,
	renderCollectionEntriesModule,
	renderVirtualModuleTypes,
} from './codegen.ts';
import { compareEntriesBySlug } from './sort.ts';
import { ContentScanner } from './content-scanner.ts';
import {
	createContentPlugin,
	createContentPluginBundler,
	getCollectionCachePath,
	getCollectionBrowserCachePath,
	getCollectionServerCachePath,
} from './content-plugins.ts';
import { createContentServerBoundaryPlugin } from './content-server-boundary-plugin.ts';
import { COLLECTION_NAME_PATTERN, CONTENT_PROCESSOR_NAME } from './constants.ts';
import type { ContentProcessorConfig } from './collection-types.ts';
import { buildContentDevPrewarmPathnames } from './dev-prewarm-paths.ts';
import { buildCollectionServerModule } from '@ecopages/core/services/module-loading/collection-server-module-build.service';

const logger = new Logger('[@ecopages/content-processor]', {
	debug: process.env.ECOPAGES_LOGGER_DEBUG === 'true',
});

function assertValidCollectionName(collectionName: string): void {
	if (!COLLECTION_NAME_PATTERN.test(collectionName)) {
		throw new Error(
			`Invalid content collection name "${collectionName}". Use kebab-case identifiers matching ${COLLECTION_NAME_PATTERN}.`,
		);
	}
}

/**
 * Build-time processor that scans configured content collections and exposes
 * each one as `ecopages:content/<collection>` virtual modules.
 */
export class ContentProcessorPlugin extends Processor<ContentProcessorConfig> {
	private collectionsGenerated = false;
	private readonly scanners = new Map<string, ContentScanner>();
	private readonly collectionBuildPromises = new Map<string, Promise<void>>();
	private readonly collectionGenerations = new Map<string, number>();

	/**
	 * Absolute paths to generated collection entry modules, keyed by collection name.
	 * Virtual-module plugins close over this object so mutations stay live.
	 */
	public readonly collectionModules: Record<string, string> = {};

	/**
	 * Absolute paths to generated server-only component resolver modules.
	 */
	public readonly collectionServerModules: Record<string, string> = {};

	/** Absolute paths to generated browser-safe component loader modules. */
	public readonly collectionBrowserModules: Record<string, string> = {};

	/**
	 * Absolute paths to pre-built collection server artifacts for route-module externalization.
	 */
	public readonly collectionServerCompiledModules: Record<string, string> = {};

	constructor(config: Omit<ProcessorConfig<ContentProcessorConfig>, 'name' | 'description'>) {
		const defaultWatchConfig: ProcessorWatchConfig = {
			paths: [],
			extensions: ['mdx'],
			onCreate: async (ctx) => this.handleContentFileEvent(ctx.path, 'create'),
			onChange: async (ctx) => this.handleContentFileEvent(ctx.path, 'change'),
			onDelete: async (ctx) => this.handleContentFileEvent(ctx.path, 'delete'),
		};

		super({
			...config,
			name: CONTENT_PROCESSOR_NAME,
			description: 'Build-time content collections exposed as ecopages:content/* virtual modules.',
			watch: config.watch ? mergeProcessorOptions(defaultWatchConfig, config.watch) : defaultWatchConfig,
		});
	}

	get buildPlugins(): EcoBuildPlugin[] {
		return [
			createContentServerBoundaryPlugin(),
			createContentPluginBundler(
				this.collectionModules,
				this.collectionServerModules,
				this.collectionServerCompiledModules,
				this.collectionBrowserModules,
			),
		];
	}

	get plugins(): EcoBuildPlugin[] {
		return [
			createContentPlugin(
				this.collectionModules,
				this.collectionServerModules,
				this.collectionServerCompiledModules,
				this.collectionBrowserModules,
				(collectionName) => this.ensureCollectionServerArtifact(collectionName),
			),
		];
	}

	private getCollectionsConfig(): ContentProcessorConfig['collections'] {
		if (!this.options?.collections) {
			throw new Error('Content processor requires `options.collections`');
		}
		return this.options.collections;
	}

	private getCollectionContentRoot(contentDir: string): string {
		if (!this.context) {
			throw new Error('Content processor requires context to be set');
		}
		return path.join(this.context.srcDir, contentDir);
	}

	private writeGeneratedFile(filePath: string, content: string): void {
		fileSystem.ensureDir(path.dirname(filePath));
		if (fileSystem.exists(filePath) && fileSystem.readFileSync(filePath) === content) {
			return;
		}
		fileSystem.write(filePath, content);
	}

	private getOrCreateScanner(collectionName: string): ContentScanner {
		const existing = this.scanners.get(collectionName);
		if (existing) {
			return existing;
		}

		const definition = this.getCollectionsConfig()[collectionName];
		if (!definition) {
			throw new Error(`Unknown content collection: ${collectionName}`);
		}

		const scanner = new ContentScanner({
			contentRoot: this.getCollectionContentRoot(definition.contentDir),
			orderBy: definition.orderBy ?? compareEntriesBySlug,
			extensions: definition.extensions,
			schema: definition.schema,
		});
		this.scanners.set(collectionName, scanner);
		return scanner;
	}

	private async regenerateCollectionModule(collectionName: string): Promise<void> {
		if (!this.context?.cache) {
			throw new Error('Content processor requires context to be set');
		}

		assertValidCollectionName(collectionName);

		const definition = this.getCollectionsConfig()[collectionName];
		if (!definition) {
			return;
		}

		const scanner = this.getOrCreateScanner(collectionName);
		scanner.clearCache();

		const entrySources = await scanner.getEntrySources();
		const manifest = entrySources.map(({ entry }) => entry);
		const outputFile = getCollectionCachePath(this.context.cache, collectionName);
		const serverOutputFile = getCollectionServerCachePath(this.context.cache, collectionName);
		const browserOutputFile = getCollectionBrowserCachePath(this.context.cache, collectionName);
		const outputDir = path.dirname(outputFile);
		const entriesOutput = renderCollectionEntriesModule(collectionName, manifest);
		const componentsOutput = renderCollectionComponentsModule(collectionName, outputDir, entrySources);
		const browserOutput = renderCollectionBrowserModule(collectionName, outputDir, entrySources);

		this.writeGeneratedFile(outputFile, entriesOutput);
		this.writeGeneratedFile(serverOutputFile, componentsOutput);
		this.writeGeneratedFile(browserOutputFile, browserOutput);
		this.collectionModules[collectionName] = outputFile;
		this.collectionServerModules[collectionName] = serverOutputFile;
		this.collectionBrowserModules[collectionName] = browserOutputFile;
		this.invalidateCollectionServerArtifact(collectionName);

		logger.debug('Generated content collection module', {
			collectionName,
			outputFile,
			serverOutputFile,
			browserOutputFile,
			entryCount: manifest.length,
		});
	}

	/**
	 * Discards the compiled collection bundle after one of its MDX sources changes.
	 *
	 * @remarks
	 * A body-only edit leaves the generated manifest unchanged, but the compiled
	 * server collection embeds every entry's MDX module. Bumping the generation
	 * also prevents an already-running compilation from publishing stale output.
	 */
	private invalidateCollectionServerArtifact(collectionName: string): void {
		delete this.collectionServerCompiledModules[collectionName];
		this.collectionGenerations.set(collectionName, (this.collectionGenerations.get(collectionName) ?? 0) + 1);
	}

	private async regenerateCollectionEntriesModule(collectionName: string): Promise<void> {
		if (!this.context?.cache) {
			throw new Error('Content processor requires context to be set');
		}

		assertValidCollectionName(collectionName);

		const scanner = this.getOrCreateScanner(collectionName);
		const manifest = (await scanner.getManifest()).map((entry) => entry);
		const outputFile = getCollectionCachePath(this.context.cache, collectionName);
		const entriesOutput = renderCollectionEntriesModule(collectionName, manifest);

		this.writeGeneratedFile(outputFile, entriesOutput);
		this.collectionModules[collectionName] = outputFile;
	}

	private async regenerateCollections(collectionNames: Iterable<string>): Promise<void> {
		for (const collectionName of collectionNames) {
			await this.regenerateCollectionModule(collectionName);
		}
		this.generateTypes();
	}

	private async regenerateAllCollections(): Promise<void> {
		await this.regenerateCollections(Object.keys(this.getCollectionsConfig()));
	}

	private async handleContentFileEvent(filePath: string, event: 'change' | 'create' | 'delete'): Promise<void> {
		if (!this.context) {
			return;
		}

		const normalizedPath = path.normalize(filePath);
		const affectedCollections: string[] = [];

		for (const [collectionName, definition] of Object.entries(this.getCollectionsConfig())) {
			const contentRoot = this.getCollectionContentRoot(definition.contentDir);
			if (normalizedPath.startsWith(contentRoot + path.sep) || normalizedPath === contentRoot) {
				affectedCollections.push(collectionName);
			}
		}

		let shouldRegenerateTypes = false;

		for (const collectionName of affectedCollections) {
			if (event === 'create' || event === 'delete') {
				await this.regenerateCollectionModule(collectionName);
				shouldRegenerateTypes = true;
				continue;
			}

			const scanner = this.getOrCreateScanner(collectionName);
			const updateResult = await scanner.updateEntryForPath(normalizedPath, event);

			if (updateResult === 'no-op') {
				this.invalidateCollectionServerArtifact(collectionName);
				continue;
			}

			if (updateResult === 'manifest') {
				await this.regenerateCollectionEntriesModule(collectionName);
				shouldRegenerateTypes = true;
				continue;
			}

			await this.regenerateCollectionModule(collectionName);
			shouldRegenerateTypes = true;
		}

		if (shouldRegenerateTypes) {
			this.generateTypes();
		}
	}

	private initializeWatchPaths(): void {
		if (!this.watchConfig || !this.context) {
			return;
		}

		this.watchConfig.paths = Object.values(this.getCollectionsConfig()).map((definition) =>
			this.getCollectionContentRoot(definition.contentDir),
		);
	}

	private generateTypes(): void {
		if (!this.context) {
			throw new Error('Content processor requires context to be set');
		}

		const collectionNames = Object.keys(this.getCollectionsConfig());
		for (const collectionName of collectionNames) {
			assertValidCollectionName(collectionName);
		}

		const typesDir = resolveGeneratedPath('types', {
			root: this.context.rootDir,
			module: this.name,
			subPath: 'virtual-module.d.ts',
		});

		const content = renderVirtualModuleTypes(this.getCollectionsConfig(), {
			rootDir: this.context.rootDir,
			typesOutputFile: typesDir,
		});

		this.writeGeneratedFile(typesDir, content);

		const indexTypesDir = resolveGeneratedPath('types', {
			root: this.context.rootDir,
			module: this.name,
			subPath: 'index.d.ts',
		});

		this.writeGeneratedFile(indexTypesDir, 'import "./virtual-module.d.ts";\n');

		writeGeneratedTypesPackage({
			root: this.context.rootDir,
			module: this.name,
			packageName: '@types/ecopages-content-processor',
			writeFile: (filePath, content) => this.writeGeneratedFile(filePath, content),
		});
	}

	private async buildCollectionServerArtifact(
		collectionName: string,
		serverOutputFile: string,
		ownedSourcePaths: string[],
	): Promise<void> {
		if (!this.context?.config.runtime?.buildRuntime) {
			return;
		}

		const artifact = await buildCollectionServerModule({
			appConfig: this.context.config,
			collectionName,
			sourceFilePath: serverOutputFile,
			ownedSourcePaths,
		});
		this.collectionServerCompiledModules[collectionName] = artifact.outputPath;
	}

	/**
	 * Builds one collection artifact on demand when a server build first resolves it.
	 *
	 * @remarks
	 * Startup only generates the small virtual modules. The expensive MDX bundle is
	 * single-flight and starts after the server is listening, while concurrent Page
	 * builds share the same promise.
	 */
	async ensureCollectionServerArtifact(collectionName: string): Promise<void> {
		if (!this.context?.config.runtime?.buildRuntime) {
			return;
		}

		if (this.collectionServerCompiledModules[collectionName]) {
			return;
		}

		const inFlight = this.collectionBuildPromises.get(collectionName);
		if (inFlight) {
			await inFlight;
			if (!this.collectionServerCompiledModules[collectionName]) {
				await this.ensureCollectionServerArtifact(collectionName);
			}
			return;
		}

		const generation = this.collectionGenerations.get(collectionName) ?? 0;
		const serverOutputFile = this.collectionServerModules[collectionName];
		if (!serverOutputFile) {
			throw new Error(`Unknown content collection: ${collectionName}`);
		}

		const scanner = this.scanners.get(collectionName);
		const ownedSourcePaths = scanner ? (await scanner.getEntrySources()).map(({ filePath }) => filePath) : [];
		const buildPromise = this.buildCollectionServerArtifact(collectionName, serverOutputFile, ownedSourcePaths)
			.then(() => {
				if (generation !== (this.collectionGenerations.get(collectionName) ?? 0)) {
					delete this.collectionServerCompiledModules[collectionName];
				}
			})
			.finally(() => this.collectionBuildPromises.delete(collectionName));
		this.collectionBuildPromises.set(collectionName, buildPromise);
		await buildPromise;
		if (!this.collectionServerCompiledModules[collectionName]) {
			await this.ensureCollectionServerArtifact(collectionName);
		}
	}

	private async ensureCollectionsGenerated(): Promise<void> {
		if (this.collectionsGenerated) {
			return;
		}

		this.initializeWatchPaths();
		await this.regenerateAllCollections();
		this.collectionsGenerated = true;
	}

	override async prepareBuildContributions(): Promise<void> {
		await this.ensureCollectionsGenerated();
	}

	override async setup(): Promise<void> {
		await this.ensureCollectionsGenerated();
	}

	override async process(_input: unknown): Promise<void> {
		await this.regenerateAllCollections();
	}

	/**
	 * Declares watch-mode SSR prewarm pathnames and readiness derived from collection manifests.
	 *
	 * @remarks
	 * Core executes rendering in parallel; this hook only maps `routePrefix` + entry slugs to URLs.
	 */
	override async collectDevPrewarmPlan(): Promise<{
		pathnames: readonly string[];
		readiness: 'background' | 'beforeReady';
	}> {
		await this.ensureCollectionsGenerated();

		const pathnames: string[] = [];
		let readiness: 'background' | 'beforeReady' = 'background';

		for (const [collectionName, definition] of Object.entries(this.getCollectionsConfig())) {
			if (definition.devPrewarmReadiness === 'beforeReady') {
				readiness = 'beforeReady';
			}

			if (!definition.devPrewarm || !definition.routePrefix) {
				continue;
			}

			const scanner = this.getOrCreateScanner(collectionName);
			const entries = await scanner.getManifest();
			pathnames.push(...buildContentDevPrewarmPathnames(definition, entries));
		}

		return {
			pathnames: [...new Set(pathnames)],
			readiness,
		};
	}
}

export const contentProcessorPlugin = (
	config: Omit<ProcessorConfig<ContentProcessorConfig>, 'name' | 'description'>,
): ContentProcessorPlugin => {
	return new ContentProcessorPlugin(config);
};
