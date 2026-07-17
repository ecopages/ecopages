export function decodeHtmlEntities(value: string): string {
	let decoded = value;
	let previous: string | undefined;

	do {
		previous = decoded;
		decoded = decoded
			.replaceAll('&quot;', '"')
			.replaceAll('&#39;', "'")
			.replaceAll('&#x27;', "'")
			.replaceAll('&lt;', '<')
			.replaceAll('&gt;', '>')
			.replaceAll('&amp;', '&');
	} while (decoded !== previous);

	return decoded;
}

export function normalizeUnresolvedMarkerArtifactHtml(html: string): string {
	return html.replace(
		/&(?:amp;)?lt;eco-marker\b[\s\S]*?&(?:amp;)?gt;&(?:amp;)?lt;\/eco-marker&(?:amp;)?gt;/g,
		(marker) => decodeHtmlEntities(marker),
	);
}

export function inspectUnresolvedMarkerArtifactHtml(html: string): {
	hasUnresolvedMarkerArtifacts: boolean;
	normalizedHtml: string;
} {
	const normalizedHtml = normalizeUnresolvedMarkerArtifactHtml(html);

	return {
		normalizedHtml,
		hasUnresolvedMarkerArtifacts: normalizedHtml.includes('<eco-marker'),
	};
}
