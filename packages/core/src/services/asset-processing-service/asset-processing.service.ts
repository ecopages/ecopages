import path from 'node:path';
import { RESOLVED_ASSETS_DIR } from '../../constants';
import { appLogger } from '../../global/app-logger';
import type { EcoPagesAppConfig } from '../../internal-types';
import { FileUtils } from '../../utils/file-utils.module';
import type { AssetDefinition, AssetKind, AssetSource, ProcessedAsset } from './assets.types';
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

	constructor(private readonly config: EcoPagesAppConfig) {}

	registerProcessor(kind: AssetKind, variant: AssetSource, processor: any): void {
		this.registry.register(kind, variant, processor);
	}

	async processDependencies(deps: AssetDefinition[], key: string): Promise<ProcessedAsset[]> {
		const depsDir = path.join(this.config.absolutePaths.distDir, RESOLVED_ASSETS_DIR);
		FileUtils.ensureDirectoryExists(depsDir);

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
					const processedWithKey = {
						key,
						...processed,
						srcUrl: processed.filepath ? this.getSrcUrl(processed.filepath) : undefined,
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
		return filepath.split(this.config.absolutePaths.distDir)[1];
	}

	private async optimizeDependencies(depsDir: string): Promise<void> {
		if (process.env.NODE_ENV === 'production') {
			FileUtils.gzipDirSync(depsDir, ['css', 'js']);
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
