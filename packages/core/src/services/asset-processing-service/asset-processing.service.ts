import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig, IHmrManager } from '../../internal-types';
import { fileSystem } from '@ecopages/file-system';
import type { AssetDefinition, AssetKind, AssetSource, ProcessedAsset } from './assets.types';
import { isHmrAware } from './processor.interface';
import { ProcessorRegistry } from './processor.registry';
import {
	ContentScriptProcessor,
	ContentStylesheetProcessor,
	FileScriptProcessor,
	FileStylesheetProcessor,
	NodeModuleScriptProcessor,
} from './processors';

export class AssetProcessingService {
	static readonly RESOLVED_ASSETS_DIR = RESOLVED_ASSETS_DIR;
	private registry = new ProcessorRegistry();
	private hmrManager?: IHmrManager;

	constructor(private readonly config: EcoPagesAppConfig) {}

	/**
	 * Set the HMR manager for the asset processing service.
	 * @param hmrManager The HMR manager to set.
	 */
	setHmrManager(hmrManager: IHmrManager) {
		this.hmrManager = hmrManager;

		for (const processor of this.registry.getAllProcessors().values()) {
			if (isHmrAware(processor)) {
				processor.setHmrManager(hmrManager);
			}
		}
	}

	getHmrManager(): IHmrManager | undefined {
		return this.hmrManager;
	}

	/**
	 * Register a processor for a specific asset kind and source.
	 * @param kind The asset kind.
	 * @param variant The asset source.
	 * @param processor The processor to register.
	 */
	registerProcessor(kind: AssetKind, variant: AssetSource, processor: any): void {
		if (this.hmrManager && isHmrAware(processor)) {
			processor.setHmrManager(this.hmrManager);
		}
		this.registry.register(kind, variant, processor);
	}

	async processDependencies(deps: AssetDefinition[], key: string): Promise<ProcessedAsset[]> {
		const depsDir = path.join(this.config.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
		fileSystem.ensureDir(depsDir);

		const results = await this.processDependenciesParallel(deps, key);

		await this.optimizeDependencies(depsDir);
		return results;
	}

	private async processDependenciesParallel(deps: AssetDefinition[], key: string): Promise<ProcessedAsset[]> {
		const grouped = this.groupDependenciesByType(deps);

		const groupPromises = Object.entries(grouped).map(async ([, typeDeps]) => {
			const typePromises = typeDeps.map(async (dep) => {
				const processor = this.registry.getProcessor(dep.kind, dep.source);
				if (!processor) {
					appLogger.error(`No processor found for ${dep.kind}/${dep.source}`);
					return null;
				}

				try {
					const processed = await processor.process(dep);
					const srcUrl =
						processed.srcUrl && processed.srcUrl.startsWith('/')
							? processed.srcUrl
							: processed.filepath
								? this.getSrcUrl(processed.filepath)
								: undefined;

					const processedWithKey = {
						key,
						...processed,
						srcUrl,
					};
					return processedWithKey as ProcessedAsset;
				} catch (error) {
					appLogger.error(
						`Failed to process dependency: ${
							error instanceof Error ? error.message : String(error)
						} for ${dep.kind}/${dep.source}`,
					);
					appLogger.debug(error as Error);
					return null;
				}
			});

			const typeResults = await Promise.all(typePromises);
			return typeResults.filter((result) => result !== null);
		});

		const allTypeResults = await Promise.all(groupPromises);
		return allTypeResults.flat();
	}

	private groupDependenciesByType(deps: AssetDefinition[]): Record<string, AssetDefinition[]> {
		return deps.reduce(
			(acc, dep) => {
				const key = `${dep.kind}_${dep.source}`;
				if (!acc[key]) acc[key] = [];
				acc[key].push(dep);
				return acc;
			},
			{} as Record<string, AssetDefinition[]>,
		);
	}

	private getSrcUrl(filepath: string): string | undefined {
		const relativePath = filepath.split(this.config.absolutePaths.distDir)[1];
		if (!relativePath) return undefined;
		return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
	}

	private async optimizeDependencies(depsDir: string): Promise<void> {
		if (process.env.NODE_ENV === 'production') {
			fileSystem.gzipDir(depsDir, ['css', 'js']);
		}
	}

	static createWithDefaultProcessors(appConfig: EcoPagesAppConfig): AssetProcessingService {
		const service = new AssetProcessingService(appConfig);

		service.registerProcessor('script', 'content', new ContentScriptProcessor({ appConfig }));
		service.registerProcessor('script', 'file', new FileScriptProcessor({ appConfig }));
		service.registerProcessor('script', 'node-module', new NodeModuleScriptProcessor({ appConfig }));

		service.registerProcessor('stylesheet', 'content', new ContentStylesheetProcessor({ appConfig }));
		service.registerProcessor('stylesheet', 'file', new FileStylesheetProcessor({ appConfig }));

		return service;
	}

	getRegistry(): ProcessorRegistry {
		return this.registry;
	}
}
