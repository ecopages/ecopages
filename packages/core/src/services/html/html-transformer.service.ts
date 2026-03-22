import type { AssetPosition, ProcessedAsset, ScriptAsset } from '../assets/asset-processing-service/assets.types';
import {
	DefaultHtmlRewriterProvider,
	type HtmlRewriterElement,
	type HtmlRewriterMode,
	type HtmlRewriterProvider,
} from './html-rewriter-provider.service';

export interface HtmlTransformerServiceOptions {
	htmlRewriterMode?: HtmlRewriterMode;
	htmlRewriterProvider?: HtmlRewriterProvider;
}

export class HtmlTransformerService {
	private processedDependencies: ProcessedAsset[] = [];
	private htmlRewriterProvider: HtmlRewriterProvider;

	constructor(options: HtmlTransformerServiceOptions = {}) {
		this.htmlRewriterProvider = options.htmlRewriterProvider ?? new DefaultHtmlRewriterProvider();

		if (options.htmlRewriterMode) {
			this.htmlRewriterProvider.setMode(options.htmlRewriterMode);
		}
	}

	/**
	 * Overrides the HTML rewriter runtime selection.
	 *
	 * This is intended for internal/runtime tests that need deterministic
	 * selection between native, worker-tools, and string fallback behavior.
	 *
	 * @param mode Requested runtime selection strategy.
	 */
	setHtmlRewriterMode(mode: HtmlRewriterMode) {
		this.htmlRewriterProvider.setMode(mode);
	}

	private formatAttributes(attrs?: Record<string, string>): string {
		if (!attrs) return '';
		return ` ${Object.entries(attrs)
			.map(([key, value]) => `${key}="${value}"`)
			.join(' ')}`;
	}

	private generateScriptTag(dep: ProcessedAsset & { kind: 'script' }): string {
		return dep.inline
			? `<script${this.formatAttributes(dep.attributes)}>${dep.content}</script>`
			: `<script src="${dep.srcUrl}"${this.formatAttributes(dep.attributes)}></script>`;
	}

	private generateStylesheetTag(dep: ProcessedAsset): string {
		return dep.inline
			? `<style${this.formatAttributes(dep.attributes)}>${dep.content}</style>`
			: `<link rel="stylesheet" href="${dep.srcUrl}"${this.formatAttributes(dep.attributes)}>`;
	}

	private appendDependencies(element: HtmlRewriterElement, dependencies: ProcessedAsset[]) {
		for (const dep of dependencies) {
			const tag =
				dep.kind === 'script' ? this.generateScriptTag(dep as ScriptAsset) : this.generateStylesheetTag(dep);
			element.append(tag, { html: true });
		}
	}

	private buildDependencyTags(dependencies: ProcessedAsset[]): string {
		return dependencies
			.map((dep) =>
				dep.kind === 'script' ? this.generateScriptTag(dep as ScriptAsset) : this.generateStylesheetTag(dep),
			)
			.join('');
	}

	/**
	 * Injects generated markup immediately before the closing HTML tag when it is
	 * present, or appends/prepends a fallback insertion otherwise.
	 */
	private injectBeforeClosingTag(html: string, tag: 'head' | 'body', content: string): string {
		if (!content) {
			return html;
		}

		const closingTag = `</${tag}>`;
		const lowerHtml = html.toLowerCase();
		const closingTagIndex = lowerHtml.lastIndexOf(closingTag);

		if (closingTagIndex !== -1) {
			return `${html.slice(0, closingTagIndex)}${content}${html.slice(closingTagIndex)}`;
		}

		if (tag === 'head') {
			return `${content}${html}`;
		}

		return `${html}${content}`;
	}

	/**
	 * Replaces the current processed dependency set used during HTML finalization.
	 */
	setProcessedDependencies(processedDependencies: ProcessedAsset[]) {
		this.processedDependencies = processedDependencies;
	}

	/**
	 * Returns the processed dependencies queued for the next transform pass.
	 */
	getProcessedDependencies(): ProcessedAsset[] {
		return this.processedDependencies;
	}

	/**
	 * Applies attributes to the opening `<html>` tag when present.
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
	 * Applies attributes to the first element nested directly under `<body>`.
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
	 * Applies attributes to the first element in a fragment or full-document HTML
	 * string.
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
	 * Removes duplicate processed assets while preserving first-seen order.
	 *
	 * @remarks
	 * Dedupe keys include structural asset fields and HTML attributes so repeated
	 * orchestration passes can merge assets safely without collapsing distinct tag
	 * variants.
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
	 * Injects the currently processed dependencies into an HTML response.
	 *
	 * @remarks
	 * Native or worker-tools HTML rewriter support is preferred when available. A
	 * string-based fallback remains in place for runtimes that cannot provide one
	 * of those rewriter implementations.
	 */
	async transform(res: Response): Promise<Response> {
		const { head, body } = this.groupDependenciesByPosition();
		const htmlRewriter = await this.htmlRewriterProvider.createHtmlRewriter();

		const html = await res.text();
		const headers = new Headers(res.headers);

		if (htmlRewriter) {
			htmlRewriter
				.on('head', {
					element: (element) => this.appendDependencies(element, head),
				})
				.on('body', {
					element: (element) => this.appendDependencies(element, body),
				});

			return htmlRewriter.transform(
				new Response(html, {
					headers,
					status: res.status,
					statusText: res.statusText,
				}),
			);
		}

		const withHeadDependencies = this.injectBeforeClosingTag(html, 'head', this.buildDependencyTags(head));
		const transformedHtml = this.injectBeforeClosingTag(
			withHeadDependencies,
			'body',
			this.buildDependencyTags(body),
		);

		return new Response(transformedHtml, {
			headers,
			status: res.status,
			statusText: res.statusText,
		});
	}

	/**
	 * Splits processed assets into head and body injection groups.
	 */
	private groupDependenciesByPosition() {
		return this.processedDependencies.reduce(
			(acc, dep) => {
				if (dep.kind === 'script') {
					if (dep.excludeFromHtml) return acc;
					const position = dep.position || 'body';
					acc[position].push(dep);
				} else if (dep.kind === 'stylesheet') {
					acc.head.push(dep);
				}
				return acc;
			},
			{ head: [], body: [] } as Record<AssetPosition, ProcessedAsset[]>,
		);
	}

	/**
	 * Builds a serialized HTML attribute string from an attribute object.
	 */
	private buildAttributeString(attributes: Record<string, string>): string {
		return Object.entries(attributes)
			.filter(([key, value]) => key.length > 0 && value.length > 0)
			.map(([key, value]) => ` ${key}="${value}"`)
			.join('');
	}
}
