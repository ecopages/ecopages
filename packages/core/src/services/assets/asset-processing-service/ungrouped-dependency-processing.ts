import { fileSystem } from '@ecopages/file-system';
import { finalizeProcessedAsset } from './finalize-processed-asset.ts';
import type { AssetProcessor } from './processor.interface.ts';
import type { AssetDefinition, ProcessedAsset } from './assets.types.ts';

type ProcessUngroupedDependencyOptions = {
	dep: AssetDefinition;
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
		return finalizeProcessedAsset(cached, resolveProcessedAssetSrcUrl);
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
		const finalized = finalizeProcessedAsset(processed, resolveProcessedAssetSrcUrl);

		setCachedAsset(dep, depKey, finalized);
		return finalized;
	} catch (error) {
		logProcessingError(dep, error);
		return null;
	}
}
