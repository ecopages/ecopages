import { timingSafeEqual } from 'node:crypto';
import { createMiddleware } from '@ecopages/core';
import { z } from 'zod';

/** The part of the page cache service that revalidation uses. */
export type RevalidationCache = {
	invalidateByTags(tags: string[]): Promise<unknown>;
	invalidateByPaths(paths: string[]): Promise<unknown>;
};

/** The body of `POST /api/revalidate`: the tags and paths to drop, each a list of strings and empty when omitted. */
export const revalidateSchema = z.object({
	tags: z.array(z.string()).default([]),
	paths: z.array(z.string()).default([]),
});

export type RevalidateTargets = z.output<typeof revalidateSchema>;

function hasToken(request: Request, token: string): boolean {
	const expected = Buffer.from(`Bearer ${token}`);
	const received = Buffer.from(request.headers.get('authorization') ?? '');
	return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Answers 404 when no token is configured and 401 for a request that does not carry it, or `null` to go on.
 *
 * @remarks
 * Without `REVALIDATE_TOKEN` the endpoint answers 404, so a fresh copy of the template exposes nothing.
 */
export function refuseWithoutToken(request: Request, token: string | undefined): Response | null {
	if (!token) return new Response('Not found', { status: 404 });
	if (!hasToken(request, token)) return Response.json({ error: 'Invalid token.' }, { status: 401 });
	return null;
}

/**
 * The Endpoint's token stage: it runs before the body is read, so an unauthenticated request is never parsed.
 */
export const requireRevalidateToken = createMiddleware(
	(context, next) => refuseWithoutToken(context.request, process.env.REVALIDATE_TOKEN) ?? next(),
);

/**
 * `POST /api/revalidate`: drops cached pages by tag or path, for example after a catalog import.
 *
 * @remarks
 * Send `Authorization: Bearer <REVALIDATE_TOKEN>` and a JSON body such as `{ "tags": ["products"] }` or
 * `{ "paths": ["/products/<slug>"] }`; Ecopages validates it against {@link revalidateSchema} and answers 400 for
 * any other shape. The page cache is off in development, so there it reports `revalidated: false`.
 */
export async function revalidateAction(
	{ tags, paths }: RevalidateTargets,
	{ cache }: { cache: RevalidationCache | null },
): Promise<Response> {
	if (!cache) return Response.json({ revalidated: false });

	if (tags.length) await cache.invalidateByTags(tags);
	if (paths.length) await cache.invalidateByPaths(paths);
	return Response.json({ revalidated: true });
}
