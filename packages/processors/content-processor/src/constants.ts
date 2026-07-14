/** Processor registry name and generated artifact namespace. */
export const CONTENT_PROCESSOR_NAME = 'ecopages-content-processor';

/** Virtual module prefix for collection imports, e.g. `ecopages:content/docs`. */
export const CONTENT_VIRTUAL_MODULE_PREFIX = 'ecopages:content';

/** Matches `ecopages:content/<collection>` metadata specifiers (no MDX imports). */
export const CONTENT_VIRTUAL_MODULE_PATTERN = /^ecopages:content\/[a-z][a-z0-9-]*$/;

/** Matches `ecopages:content/<collection>/server` component resolver specifiers (MDX imports). */
export const CONTENT_SERVER_VIRTUAL_MODULE_PATTERN = /^ecopages:content\/[a-z][a-z0-9-]+\/server$/;

/** Validates collection keys used in processor options and virtual module paths. */
export const COLLECTION_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
