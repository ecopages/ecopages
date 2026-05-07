import { fileSystem } from '@ecopages/file-system';
import type { AssetProcessor } from './processor.interface.ts';
import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

type ProcessUngroupedDependencyOptions = {
	dep: AssetDefinition;
	key: string;
	depKey: string;
	getCachedAsset: (dep: AssetDefinition, depKey: string) => ProcessedAsset | null;
	getProcessor: (dep: AssetDefinition) => AssetProcessor | undefined;
	resolveProcessedAssetSrcUrl: (processed: ProcessedAsset) => string | undefined;
	setCachedAsset: (dep: AssetDefinition, depKey: string, processed: ProcessedAsset) => void;
	logMissingProcessor: (dep: AssetDefinition) => void;
	logMissingFile: (dep: AssetDefinition & { filepath: string }) => void;
	logProcessingError: (dep: AssetDefinition, error: unknown) => void;
};

export async function processUngroupedDependency(
	options: ProcessUngroupedDependencyOptions,
): Promise<ProcessedAsset | null> {
	const {
		dep,
		key,
		depKey,
		getCachedAsset,
		getProcessor,
		resolveProcessedAssetSrcUrl,
		setCachedAsset,
		logMissingProcessor,
		logMissingFile,
		logProcessingError,
	} = options;
	const cached = getCachedAsset(dep, depKey);

	if (cached) {
		return { key, ...cached } as ProcessedAsset;
	}

	const processor = getProcessor(dep);
	if (!processor) {
		logMissingProcessor(dep);
		return null;
	}

	if (dep.source === 'file' && 'filepath' in dep && !fileSystem.exists(dep.filepath)) {
		logMissingFile(dep);
		return null;
	}

	try {
		const processed = await processor.process(dep);
		const srcUrl = resolveProcessedAssetSrcUrl(processed);
		const processedWithKey = {
			key,
			...processed,
			srcUrl,
		};

		setCachedAsset(dep, depKey, processedWithKey);
		return processedWithKey as ProcessedAsset;
	} catch (error) {
		logProcessingError(dep, error);
		return null;
	}
}
