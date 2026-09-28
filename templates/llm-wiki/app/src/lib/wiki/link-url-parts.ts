export type WikiLinkUrlParts = {
	pathname: string;
	query: string;
	hash: string;
};

export function isOpaqueWikiLinkUrl(url: string): boolean {
	return (
		!url ||
		url.startsWith('http://') ||
		url.startsWith('https://') ||
		url.startsWith('mailto:') ||
		url.startsWith('tel:') ||
		url.startsWith('data:')
	);
}

export function splitWikiLinkUrl(url: string): WikiLinkUrlParts {
	const hashIndex = url.indexOf('#');
	const pathPart = hashIndex === -1 ? url : url.slice(0, hashIndex);
	const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
	const queryIndex = pathPart.indexOf('?');
	const pathname = queryIndex === -1 ? pathPart : pathPart.slice(0, queryIndex);
	const query = queryIndex === -1 ? '' : pathPart.slice(queryIndex);

	return { pathname, query, hash };
}
