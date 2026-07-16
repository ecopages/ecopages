const VOID_TAGS = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
]);

/**
 * Returns true when HTML contains exactly one root element node.
 *
 * Used by component-level React rendering to decide whether root attributes can
 * be attached safely without introducing synthetic wrapper nodes.
 */
export function hasSingleRootElement(html: string): boolean {
	const firstTagMatch = html.match(/^\s*<([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/);
	if (!firstTagMatch) {
		return false;
	}

	const firstTag = firstTagMatch[1].toLowerCase();
	const firstTagText = firstTagMatch[0];
	const firstTagStart = firstTagMatch.index ?? 0;
	const firstTagEnd = firstTagStart + firstTagText.length;
	const isSelfClosing = /\/\s*>$/.test(firstTagText);

	if (isSelfClosing || VOID_TAGS.has(firstTag)) {
		return html.slice(firstTagEnd).trim().length === 0;
	}

	const tokenRegex = /<\/?([a-zA-Z][a-zA-Z0-9:-]*)\b[^>]*>/g;
	tokenRegex.lastIndex = firstTagEnd;
	let depth = 1;

	for (let token = tokenRegex.exec(html); token; token = tokenRegex.exec(html)) {
		const tagText = token[0];
		const tagName = token[1].toLowerCase();
		const isClosing = tagText.startsWith('</');
		const tokenSelfClosing = /\/\s*>$/.test(tagText);

		if (VOID_TAGS.has(tagName) || tokenSelfClosing) {
			continue;
		}

		if (isClosing) {
			depth--;
			if (depth === 0) {
				const afterRoot = html.slice(token.index + token[0].length).trim();
				return afterRoot.length === 0;
			}
		} else {
			depth++;
		}
	}

	return false;
}
