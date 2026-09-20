/**
 * Applies incoming document title and named meta tags to the live head.
 */
export function syncIncomingHeadMetadata(newDocument: Document): void {
	const newTitle = newDocument.head.querySelector('title');
	if (newTitle && document.title !== newTitle.textContent) {
		document.title = newTitle.textContent || '';
	}

	for (const newMeta of newDocument.head.querySelectorAll('meta[name], meta[property]')) {
		const name = newMeta.getAttribute('name');
		const property = newMeta.getAttribute('property');
		const content = newMeta.getAttribute('content');
		const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
		const existingMeta = document.head.querySelector(selector);

		if (existingMeta) {
			if (existingMeta.getAttribute('content') !== content) {
				existingMeta.setAttribute('content', content || '');
			}
			continue;
		}

		document.head.appendChild(newMeta.cloneNode(true));
	}
}
