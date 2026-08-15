import { HttpError } from '@ecopages/core/errors';
import type { PageParams } from '@ecopages/core';

type CatchAllSlugParam = PageParams[string];

/**
 * Normalizes catch-all `slug` params and enforces the wiki URL shape.
 * @throws {HttpError} 404 when the slug is missing or has too many segments.
 */
export function parseWikiCatchAllSegments(slug: CatchAllSlugParam): string[] {
	const segments = Array.isArray(slug) ? slug : slug ? slug.split('/').filter(Boolean) : [];

	if (segments.length === 0 || segments.length > 2) {
		throw HttpError.NotFound(
			`Invalid wiki slug: expected /wiki/<category>/<page>, got ${segments.join('/') || '(empty)'}`,
		);
	}

	return segments;
}
