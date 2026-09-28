import { describe, expect, it } from 'vitest';
import {
	decodeHtmlEntities,
	inspectUnresolvedMarkerArtifactHtml,
	normalizeUnresolvedMarkerArtifactHtml,
} from './marker-artifact.utils.ts';

describe('marker-artifact.utils', () => {
	it('decodes nested HTML entities until stable', () => {
		expect(decodeHtmlEntities('&amp;lt;eco-marker&amp;gt;')).toBe('<eco-marker>');
		expect(decodeHtmlEntities('&quot;x&#39;y&#x27;z&quot;')).toBe('"x\'y\'z"');
	});

	it('normalizes entity-encoded eco-marker artifacts to raw tags', () => {
		const encoded =
			'&lt;eco-marker data-eco-node-id="n1"&gt;&lt;/eco-marker&gt;' +
			'&amp;lt;eco-marker data-eco-node-id="n2"&amp;gt;&amp;lt;/eco-marker&amp;gt;';

		expect(normalizeUnresolvedMarkerArtifactHtml(encoded)).toBe(
			'<eco-marker data-eco-node-id="n1"></eco-marker><eco-marker data-eco-node-id="n2"></eco-marker>',
		);
	});

	it('inspects unresolved marker artifacts after normalization', () => {
		const encoded = 'prefix&lt;eco-marker data-eco-node-id="n1"&gt;&lt;/eco-marker&gt;suffix';
		const inspection = inspectUnresolvedMarkerArtifactHtml(encoded);

		expect(inspection.hasUnresolvedMarkerArtifacts).toBe(true);
		expect(inspection.normalizedHtml).toContain('<eco-marker data-eco-node-id="n1"></eco-marker>');
	});

	it('reports no unresolved markers for clean HTML', () => {
		const inspection = inspectUnresolvedMarkerArtifactHtml('<div>ok</div>');

		expect(inspection.hasUnresolvedMarkerArtifacts).toBe(false);
		expect(inspection.normalizedHtml).toBe('<div>ok</div>');
	});
});
