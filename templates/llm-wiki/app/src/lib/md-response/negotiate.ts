function qualityForType(accept: string, type: string): number {
	let best = 0;
	let found = false;

	for (const part of accept.split(',')) {
		const [rawMedia, ...params] = part
			.trim()
			.split(';')
			.map((segment) => segment.trim());
		const media = rawMedia.toLowerCase();
		if (!media || media === '*/*') {
			continue;
		}

		const typePrefix = `${type.split('/')[0]}/`;
		if (media !== type && media !== `${typePrefix}*`) {
			continue;
		}

		found = true;
		const qParam = params.find((param) => param.startsWith('q='));
		const q = qParam ? Number(qParam.slice(2)) : 1;
		if (Number.isFinite(q)) {
			best = Math.max(best, q);
		}
	}

	return found ? best : 0;
}

/**
 * Whether the request prefers `text/markdown` over `text/html` via Accept
 * q-values, or an explicit `?format=md` / `?format=markdown` override.
 *
 * @remarks
 * Browsers omit `text/markdown` and lose. Agents that send
 * `Accept: text/markdown, text/html;q=0.9` win. Wildcard Accept values are
 * ignored so a generic catch-all Accept does not flip HTML pages to markdown.
 */
export function prefersMarkdown(request: Request): boolean {
	const url = new URL(request.url);
	const format = url.searchParams.get('format');
	if (format === 'md' || format === 'markdown') {
		return true;
	}

	const accept = request.headers.get('accept');
	if (!accept) {
		return false;
	}

	const markdownQuality = qualityForType(accept, 'text/markdown');
	const htmlQuality = qualityForType(accept, 'text/html');
	return markdownQuality > 0 && markdownQuality >= htmlQuality;
}
