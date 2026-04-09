const ROOT_LIT_PART_PATTERN = /^<!--lit-part [^>]+-->([\s\S]*)<!--\/lit-part-->$/;
const HTML_DOCUMENT_CLOSE = '</html>';
const HTML_TEMPLATE_SLOT_MARKER = '<--content-->';

function extractAppendedChildren(appendedHtml: string): string {
	const rootLitPartMatch = appendedHtml.match(ROOT_LIT_PART_PATTERN);
	return rootLitPartMatch?.[1] ?? appendedHtml;
}

/**
 * Normalizes an Ecopages HTML response by injecting appended route content
 * into the template slot marker, unwrapping Lit SSR part wrappers, and
 * optionally injecting the Vite client script in dev mode.
 */
export function normalizeHtmlResponse(body: string, options?: { injectViteClient?: boolean }): string {
	let html = body;
	const documentCloseIndex = html.indexOf(HTML_DOCUMENT_CLOSE);

	if (documentCloseIndex !== -1 && html.includes(HTML_TEMPLATE_SLOT_MARKER)) {
		const documentEndIndex = documentCloseIndex + HTML_DOCUMENT_CLOSE.length;
		const documentHtml = html.slice(0, documentEndIndex);
		const appendedHtml = html.slice(documentEndIndex);

		if (appendedHtml.trim().length > 0) {
			const renderedChildren = extractAppendedChildren(appendedHtml);
			html = documentHtml.replace(HTML_TEMPLATE_SLOT_MARKER, renderedChildren);
		}
	}

	if (options?.injectViteClient) {
		html = html.replace('</head>', '<script type="module" src="/@vite/client"></script></head>');
	}

	return html;
}
