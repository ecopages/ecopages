import path from 'node:path';

/**
 * Returns whether a source module can be loaded directly by the host runtime without
 * first going through the transpile/import pipeline.
 */
export function supportsSourceModuleLoading(filePath: string): boolean {
	const extension = path.extname(filePath);
	return (
		extension === '.js' ||
		extension === '.jsx' ||
		extension === '.ts' ||
		extension === '.tsx' ||
		extension === '.mjs' ||
		extension === '.mts' ||
		extension === '.cjs' ||
		extension === '.cts'
	);
}
