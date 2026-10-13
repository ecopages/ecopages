import remapping, { type SourceMapInput } from '@jridgewell/remapping';

/**
 * Narrows an untyped transform map to one that can be composed.
 *
 * @remarks
 * `{ mappings: '' }` is the Rollup convention for "this rewrite has no map", and a map without `sources`
 * cannot be traced, so neither is usable. Composing them makes the remapper throw.
 */
export function isUsableSourceMap(value: unknown): value is SourceMapInput {
	if (typeof value === 'string') return value !== '';
	if (typeof value !== 'object' || value === null) return false;
	return (
		'mappings' in value &&
		typeof value.mappings === 'string' &&
		value.mappings !== '' &&
		'sources' in value &&
		Array.isArray(value.sources)
	);
}

/**
 * Composes two maps so positions in the result trace back through `previous` to the original file.
 *
 * @remarks
 * `next` maps the final code to the code `previous` produced, and `previous` maps that code to the original
 * file.
 */
export function composeSourceMaps(next: SourceMapInput, previous: SourceMapInput): SourceMapInput {
	return remapping([next, previous], () => null) as SourceMapInput;
}
