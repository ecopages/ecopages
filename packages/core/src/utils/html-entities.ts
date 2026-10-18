const NAMED_CHARACTER_REFERENCES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
};

/**
 * Decodes numeric and the common named character references in one pass.
 *
 * @remarks
 * Callers read titles, metadata, and URLs through this, so the full named
 * reference table is not worth carrying.
 */
export function decodeHtmlEntities(value: string): string {
	return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (reference, body: string) => {
		if (body[0] === '#') {
			const codePoint =
				body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
			return Number.isFinite(codePoint) && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : reference;
		}
		return NAMED_CHARACTER_REFERENCES[body.toLowerCase()] ?? reference;
	});
}

/** Decodes common references repeatedly until no encoded reference changes. */
export function decodeHtmlEntitiesUntilStable(value: string): string {
	let decoded = value;
	let previous: string | undefined;

	do {
		previous = decoded;
		decoded = decodeHtmlEntities(decoded);
	} while (decoded !== previous);

	return decoded;
}
