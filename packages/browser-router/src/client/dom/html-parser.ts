/**
 * Parses HTML string into a Document, injecting a temporary base tag for URL resolution.
 */
export function parseHTML(html: string, url?: URL): Document {
	const parser = new DOMParser();
	const htmlToParse = url ? `<base href="${url.href}" data-eco-injected>${html}` : html;
	return parser.parseFromString(htmlToParse, 'text/html');
}
