import { HttpError } from '@ecopages/core/errors';
import type { PageParams } from '@ecopages/core';

export type ResolvedDocsSlug = {
	section: string;
	slug: string;
};

type CatchAllSlugParam = PageParams[string];

/**
 * Normalizes catch-all `slug` params and enforces the docs URL shape.
 * @throws {HttpError} 404 when the slug is missing or too short for `/docs/<section>/<page>`.
 */
export function parseDocsCatchAllSegments(slug: CatchAllSlugParam): string[] {
	const segments = Array.isArray(slug) ? slug : slug ? slug.split('/').filter(Boolean) : [];

	if (segments.length < 2) {
		throw HttpError.NotFound(
			`Invalid docs slug: expected /docs/<section>/<page>, got ${segments.join('/') || '(empty)'}`,
		);
	}

	return segments;
}

/**
 * Maps catch-all `slug` param segments to a docs section and page slug.
 */
export function resolveFromCatchAll(slug: CatchAllSlugParam): ResolvedDocsSlug {
	const segments = parseDocsCatchAllSegments(slug);

	return {
		section: segments[0]!,
		slug: segments[1]!,
	};
}
