import MagicString from 'magic-string';
import type { EcoBuildOnTransformResult, EcoBuildPlugin } from './contracts/build-types.ts';

/**
 * Applies source edits while preserving mappings to the original file.
 *
 * @remarks
 * Core transforms use this when they change source positions. Inserted text is
 * unmapped; retained text keeps its original line and column positions.
 */
export function createMappedSourceTransformResult(
	code: string,
	id: string,
	edit: (source: MagicString) => void,
): EcoBuildOnTransformResult {
	const source = new MagicString(code, { filename: id });
	edit(source);

	return {
		code: source.toString(),
		map: source.generateMap({ source: id, includeContent: true, hires: 'boundary' }),
	};
}

/**
 * Wraps one of core's own source rewrites as a build plugin with a `transform` hook.
 *
 * @remarks
 * The rewrite receives the module id without its query and hash, because it reads the file the id names.
 */
export function createCoreTransformPlugin(options: {
	name: string;
	filter: RegExp;
	cacheKey?: string;
	transform(code: string, id: string): EcoBuildOnTransformResult | string | undefined;
}): EcoBuildPlugin {
	return {
		name: options.name,
		cacheKey: options.cacheKey,
		setup(build) {
			build.transform({ filter: options.filter }, (code, id) =>
				options.transform(code, id.replace(/[?#].*$/, '')),
			);
		},
	};
}
