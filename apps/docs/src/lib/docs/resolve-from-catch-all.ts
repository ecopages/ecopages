import type { PageParams } from '@ecopages/core';

type CatchAllSlugParam = PageParams[string];

/**
 * Normalizes catch-all `slug` params and enforces the docs URL shape.
 */
export function parseDocsCatchAllSegments(slug: CatchAllSlugParam): string[] {
	const segments = Array.isArray(slug) ? slug : slug ? slug.split('/').filter(Boolean) : [];

	if (segments.length < 2) {
		throw new Error(`Invalid docs slug: expected /docs/<section>/<page>, got ${segments.join('/') || '(empty)'}`);
	}

	return segments;
}
