/**
 * Public cache exports for the bundler plugin chain.
 *
 * @module @ecopages/core/cache
 */
export {
	ModuleParseCache,
	moduleParseCache,
	cachedParseSync,
	parseModuleSource,
	parserLanguageForFile,
	type ModuleParseOptions,
	type ParserLanguage,
} from './module-parse-cache.ts';
export { recordModuleTransformProfile } from './module-transform-profiler.ts';
