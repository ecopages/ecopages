/** Virtual module prefix for collection imports, e.g. `ecopages:content/docs`. */
export const CONTENT_VIRTUAL_MODULE_PREFIX = 'ecopages:content';

/** Matches `ecopages:content/<collection>` metadata specifiers (no MDX imports). */
export const CONTENT_VIRTUAL_MODULE_PATTERN = /^ecopages:content\/[a-z][a-z0-9-]*$/;

/** Matches `ecopages:content/<collection>/server` component resolver specifiers. */
export const CONTENT_SERVER_VIRTUAL_MODULE_PATTERN = /^ecopages:content\/[a-z][a-z0-9-]+\/server$/;

/**
 * Matches `ecopages:content/<collection>/component` loader specifiers.
 *
 * @remarks
 * The server graph resolves this specifier to the `/server` module and the Page Browser Graph
 * resolves it to the browser-safe loader, so one import serves both sides.
 */
export const CONTENT_COMPONENT_VIRTUAL_MODULE_PATTERN = /^ecopages:content\/[a-z][a-z0-9-]+\/component$/;

export type ParsedCollectionSpecifier = {
	collectionName: string;
	variant: 'entries' | 'server' | 'component';
};

export function parseCollectionSpecifier(specifier: string): ParsedCollectionSpecifier | null {
	const normalized = specifier.startsWith(`${CONTENT_VIRTUAL_MODULE_PREFIX}/`)
		? specifier.slice(`${CONTENT_VIRTUAL_MODULE_PREFIX}/`.length)
		: specifier.startsWith('content/')
			? specifier.slice('content/'.length)
			: null;

	if (!normalized) {
		return null;
	}

	if (normalized.endsWith('/server')) {
		return {
			collectionName: normalized.slice(0, -'/server'.length),
			variant: 'server',
		};
	}

	if (normalized.endsWith('/component')) {
		return {
			collectionName: normalized.slice(0, -'/component'.length),
			variant: 'component',
		};
	}

	return {
		collectionName: normalized,
		variant: 'entries',
	};
}

export function isContentServerVirtualModule(specifier: string): boolean {
	return CONTENT_SERVER_VIRTUAL_MODULE_PATTERN.test(specifier);
}
