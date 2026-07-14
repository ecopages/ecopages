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
	type EcoBuildPlugin,
	type ProcessorConfig,
	type ProcessorWatchConfig,
} from '@ecopages/core/plugins/processor';
import { Logger } from '@ecopages/logger';
import { renderCollectionModule, renderVirtualModuleTypes } from './codegen.ts';
import { compareEntriesBySlug } from './sort.ts';
import { ContentScanner } from './content-scanner.ts';
import { createContentPlugin, createContentPluginBundler, getCollectionCachePath } from './content-plugins.ts';
import { COLLECTION_NAME_PATTERN, CONTENT_PROCESSOR_NAME } from './constants.ts';
import type { ContentProcessorConfig } from './collection-types.ts';

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

	/**
	 * Absolute paths to generated collection modules, keyed by collection name.
	 * Virtual-module plugins close over this object so mutations stay live.
	 */
	public readonly collectionModules: Record<string, string> = {};

	constructor(config: Omit<ProcessorConfig<ContentProcessorConfig>, 'name' | 'description'>) {
		const defaultWatchConfig: ProcessorWatchConfig = {
			paths: [],
			extensions: ['mdx'],
			onCreate: async (ctx) => this.regenerateCollectionsForPath(ctx.path),
			onChange: async (ctx) => this.regenerateCollectionsForPath(ctx.path),
			onDelete: async (ctx) => this.regenerateCollectionsForPath(ctx.path),
		};

		super({
			...config,
			name: CONTENT_PROCESSOR_NAME,
			description: 'Build-time content collections exposed as ecopages:content/* virtual modules.',
			watch: config.watch ? mergeProcessorOptions(defaultWatchConfig, config.watch) : defaultWatchConfig,
		});
	}

	get buildPlugins(): EcoBuildPlugin[] {
		return [createContentPluginBundler(this.collectionModules)];
	}

	get plugins(): EcoBuildPlugin[] {
		return [createContentPlugin(this.collectionModules)];
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
		const outputDir = path.dirname(outputFile);
		const output = renderCollectionModule(collectionName, outputDir, manifest, entrySources);

		this.writeGeneratedFile(outputFile, output);
		this.collectionModules[collectionName] = outputFile;

		logger.debug('Generated content collection module', {
			collectionName,
			outputFile,
			entryCount: manifest.length,
		});
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

	private async regenerateCollectionsForPath(filePath: string): Promise<void> {
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

		if (affectedCollections.length > 0) {
			await this.regenerateCollections(affectedCollections);
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
}

export const contentProcessorPlugin = (
	config: Omit<ProcessorConfig<ContentProcessorConfig>, 'name' | 'description'>,
): ContentProcessorPlugin => {
	return new ContentProcessorPlugin(config);
};
