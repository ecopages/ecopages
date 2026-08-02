/** Processor registry name and generated artifact namespace. */
export const CONTENT_PROCESSOR_NAME = 'ecopages-content-processor';

export {
	CONTENT_SERVER_VIRTUAL_MODULE_PATTERN,
	CONTENT_VIRTUAL_MODULE_PATTERN,
	CONTENT_VIRTUAL_MODULE_PREFIX,
	parseCollectionSpecifier,
	type ParsedCollectionSpecifier,
} from '@ecopages/core/build/contracts/content-virtual-modules';

/** Validates collection keys used in processor options and virtual module paths. */
export const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
