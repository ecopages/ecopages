export type ResolvedDocsSlug = {
	section: string;
	slug: string;
};

export function resolveFromCatchAll(slug: string[] | string | undefined): ResolvedDocsSlug {
	const segments = Array.isArray(slug) ? slug : slug ? slug.split('/') : [];

	if (segments.length < 2) {
		throw new Error(`Invalid docs slug: expected /docs/<section>/<page>, got ${segments.join('/')}`);
	}

	return {
		section: segments[0]!,
		slug: segments[1]!,
	};
}
