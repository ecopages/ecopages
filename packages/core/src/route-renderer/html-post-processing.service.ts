import type { ProcessedAsset } from '../services/asset-processing-service/index.ts';

/**
 * Encapsulates HTML mutation and processed-asset normalization helpers used in
 * the final stages of route rendering.
 */
export class HtmlPostProcessingService {
	/**
	 * Applies attributes to the document `<html>` element.
	 *
	 * @param html Full HTML document.
	 * @param attributes Attribute map to inject.
	 * @returns Updated HTML document.
	 */
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string {
		const htmlTagMatch = html.match(/<html\b[^>]*>/i);
		if (!htmlTagMatch || htmlTagMatch.index === undefined) {
			return html;
		}

		const attrs = this.buildAttributeString(attributes);
		if (attrs.length === 0) {
			return html;
		}

		const injectionOffset = htmlTagMatch.index + htmlTagMatch[0].length - 1;
		return `${html.slice(0, injectionOffset)}${attrs}${html.slice(injectionOffset)}`;
	}

	/**
	 * Applies attributes to the first element immediately inside the document
	 * `<body>`.
	 *
	 * @param html Full HTML document.
	 * @param attributes Attribute map to inject.
	 * @returns Updated HTML document.
	 */
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string {
		const bodyMatch = html.match(/<body\b[^>]*>/i);
		if (!bodyMatch || bodyMatch.index === undefined) {
			return html;
		}

		const bodyOpenEnd = bodyMatch.index + bodyMatch[0].length;
		const afterBody = html.slice(bodyOpenEnd);
		const firstTagMatch = afterBody.match(/^(\s*<)([a-zA-Z][a-zA-Z0-9:-]*)(\b[^>]*>)/);
		if (!firstTagMatch || firstTagMatch.index === undefined) {
			return html;
		}

		const attrs = this.buildAttributeString(attributes);
		if (attrs.length === 0) {
			return html;
		}

		const injectionOffset = bodyOpenEnd + firstTagMatch[1].length + firstTagMatch[2].length;
		return `${html.slice(0, injectionOffset)}${attrs}${html.slice(injectionOffset)}`;
	}

	/**
	 * Applies attributes to the first top-level element in an HTML fragment.
	 *
	 * @param html HTML fragment.
	 * @param attributes Attribute map to inject.
	 * @returns Updated HTML fragment.
	 */
	applyAttributesToFirstElement(html: string, attributes: Record<string, string>): string {
		const firstTagMatch = html.match(/^(\s*<)([a-zA-Z][a-zA-Z0-9:-]*)(\b[^>]*>)/);
		if (!firstTagMatch || firstTagMatch.index === undefined) {
			return html;
		}

		const attrs = this.buildAttributeString(attributes);
		if (attrs.length === 0) {
			return html;
		}

		const injectionOffset = firstTagMatch[1].length + firstTagMatch[2].length;
		return `${html.slice(0, injectionOffset)}${attrs}${html.slice(injectionOffset)}`;
	}

	/**
	 * Deduplicates processed assets using a stable composite key while preserving
	 * first-seen order.
	 *
	 * @param assets Candidate processed assets.
	 * @returns Deduplicated processed asset list.
	 */
	dedupeProcessedAssets(assets: ProcessedAsset[]): ProcessedAsset[] {
		const unique = new Map<string, ProcessedAsset>();

		for (const asset of assets) {
			const key = [
				asset.kind,
				asset.position ?? '',
				asset.srcUrl ?? '',
				asset.filepath ?? '',
				asset.content ?? '',
				asset.inline ? 'inline' : 'external',
				asset.excludeFromHtml ? 'excluded' : 'included',
				JSON.stringify(asset.attributes ?? {}),
			].join('|');

			if (!unique.has(key)) {
				unique.set(key, asset);
			}
		}

		return [...unique.values()];
	}

	/**
	 * Converts an attribute map into an HTML attribute string, skipping empty
	 * keys and values.
	 *
	 * @param attributes Attribute map to serialize.
	 * @returns Serialized attributes prefixed with spaces.
	 */
	private buildAttributeString(attributes: Record<string, string>): string {
		return Object.entries(attributes)
			.filter(([key, value]) => key.length > 0 && value.length > 0)
			.map(([key, value]) => ` ${key}="${value}"`)
			.join('');
	}
}
