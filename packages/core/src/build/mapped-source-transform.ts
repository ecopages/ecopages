import MagicString from 'magic-string';
import type { EcoSourceTransformResult } from '../plugins/source-transform.ts';

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
): EcoSourceTransformResult {
	const source = new MagicString(code, { filename: id });
	edit(source);

	return {
		code: source.toString(),
		map: source.generateMap({ source: id, includeContent: true, hires: 'boundary' }),
	};
}
