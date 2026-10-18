import { decodeHtmlEntitiesUntilStable } from '../../../utils/html-entities.ts';

export function normalizeUnresolvedMarkerArtifactHtml(html: string): string {
	return html.replace(
		/&(?:amp;)?lt;eco-marker\b[\s\S]*?&(?:amp;)?gt;&(?:amp;)?lt;\/eco-marker&(?:amp;)?gt;/g,
		(marker) => decodeHtmlEntitiesUntilStable(marker),
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
