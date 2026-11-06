import type { EcoPageComponent, GetMetadata } from '../types/contracts.ts';

/**
 * Moves an MDX module's `getMetadata` export onto its Page as `metadata`.
 *
 * @remarks
 * MDX cannot call `eco.page(...)`, so its metadata export is the one module-level data export that
 * stays. Core reads page data from the Page only, so the integration moves the export before core
 * sees the module and leaves no `getMetadata` key behind.
 */
export function moveMdxMetadataOntoPage<T extends { default: unknown }>(
	pageModule: T & { getMetadata?: GetMetadata },
): Omit<T, 'getMetadata'> {
	const { getMetadata, ...rest } = pageModule;
	if (getMetadata) {
		(rest.default as EcoPageComponent<any>).metadata = getMetadata;
	}
	return rest;
}
