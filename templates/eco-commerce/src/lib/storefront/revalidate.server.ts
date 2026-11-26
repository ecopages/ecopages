import { timingSafeEqual } from 'node:crypto';

/** The part of the page cache service that revalidation uses. */
export type RevalidationCache = {
	invalidateByTags(tags: string[]): Promise<unknown>;
	invalidateByPaths(paths: string[]): Promise<unknown>;
};

export type RevalidateDeps = {
	token: string | undefined;
	cache: RevalidationCache | null;
};

function isStringList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** The tags and paths of a JSON body, each a list of strings when present; `null` for any other shape. */
function readTargets(body: unknown): { tags: string[]; paths: string[] } | null {
	if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
	const fields = new Map(Object.entries(body));
	const tags = fields.get('tags') ?? [];
	const paths = fields.get('paths') ?? [];
	return isStringList(tags) && isStringList(paths) ? { tags, paths } : null;
}

function hasToken(request: Request, token: string): boolean {
	const expected = Buffer.from(`Bearer ${token}`);
	const received = Buffer.from(request.headers.get('authorization') ?? '');
	return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * `POST /api/revalidate`: drops cached pages by tag or path, for example after a catalog import.
 *
 * @remarks
 * Send `Authorization: Bearer <REVALIDATE_TOKEN>` and a JSON body such as `{ "tags": ["products"] }` or
 * `{ "paths": ["/products/<slug>"] }`. Without `REVALIDATE_TOKEN` the endpoint answers 404, so a fresh copy of
 * the template exposes nothing. The page cache is off in development, so there it reports `revalidated: false`.
 */
export async function revalidateAction(request: Request, { token, cache }: RevalidateDeps): Promise<Response> {
	if (!token) return new Response('Not found', { status: 404 });
	if (!hasToken(request, token)) return Response.json({ error: 'Invalid token.' }, { status: 401 });

	const targets = readTargets(await request.json().catch(() => null));
	if (!targets) return Response.json({ error: 'Send { "tags": string[], "paths": string[] }.' }, { status: 400 });
	const { tags, paths } = targets;
	if (!cache) return Response.json({ revalidated: false });

	if (tags.length) await cache.invalidateByTags(tags);
	if (paths.length) await cache.invalidateByPaths(paths);
	return Response.json({ revalidated: true });
}
