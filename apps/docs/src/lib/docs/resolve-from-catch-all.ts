import type { PageParams } from '@ecopages/core';

export type ResolvedDocsSlug = {
	section: string;
	slug: string;
};

type CatchAllSlugParam = PageParams[string];

/**
 * Maps catch-all `slug` param segments to a docs section and page slug.
 */
export function resolveFromCatchAll(slug: CatchAllSlugParam): ResolvedDocsSlug {
	const segments = Array.isArray(slug) ? slug : slug ? slug.split('/') : [];

	if (segments.length < 2) {
		throw new Error(`Invalid docs slug: expected /docs/<section>/<page>, got ${segments.join('/')}`);
	}

	return {
		section: segments[0]!,
		slug: segments[1]!,
	};
}
