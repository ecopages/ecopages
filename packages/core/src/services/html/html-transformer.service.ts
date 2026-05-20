import type { AssetPosition, ProcessedAsset, ScriptAsset } from '../assets/asset-processing-service/assets.types.ts';
import type { PagePackageResult } from '../../types/public-types.ts';
import {
	DefaultHtmlRewriterProvider,
	type HtmlRewriterElement,
	type HtmlRewriterMode,
	type HtmlRewriterProvider,
} from './html-rewriter-provider.service.ts';
import {
	buildProcessedAssetDedupeKey,
	dedupeProcessedAssets,
} from '../../route-renderer/orchestration/processed-asset-dedupe.ts';

export type HtmlDocumentContributionPlacement = 'head-prepend' | 'head-append' | 'body-prepend' | 'body-append';

export type HtmlDocumentContribution = {
	placement: HtmlDocumentContributionPlacement;
	html: string;
};

export interface HtmlTransformerServiceOptions {
	htmlRewriterMode?: HtmlRewriterMode;
	htmlRewriterProvider?: HtmlRewriterProvider;
}

export class HtmlTransformerService {
	private processedDependencies: ProcessedAsset[] = [];
	private pagePackage?: PagePackageResult;
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

	private applyContributions(
		element: HtmlRewriterElement,
		contributions: HtmlDocumentContribution[],
		placement: 'prepend' | 'append',
	) {
		for (const contribution of contributions) {
			element[placement](contribution.html, { html: true });
		}
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

	private injectAfterOpeningTag(html: string, tag: 'head' | 'body', content: string): string {
		if (!content) {
			return html;
		}

		const openingTag = new RegExp(`<${tag}\\b[^>]*>`, 'i');
		const match = html.match(openingTag);
		if (!match || match.index === undefined) {
			return tag === 'head'
				? `${content}${html}`
				: html.replace(/<body\b[^>]*>/i, (value) => `${value}${content}`);
		}

		const insertAt = match.index + match[0].length;
		return `${html.slice(0, insertAt)}${content}${html.slice(insertAt)}`;
	}

	private groupContributionsByPlacement(contributions: HtmlDocumentContribution[]) {
		return {
			headPrepend: contributions.filter((item) => item.placement === 'head-prepend'),
			headAppend: contributions.filter((item) => item.placement === 'head-append'),
			bodyPrepend: contributions.filter((item) => item.placement === 'body-prepend'),
			bodyAppend: contributions.filter((item) => item.placement === 'body-append'),
		};
	}

	/**
	 * Replaces the current processed dependency set used during HTML finalization.
	 */
	setProcessedDependencies(processedDependencies: ProcessedAsset[]) {
		this.pagePackage = undefined;
		this.processedDependencies = processedDependencies;
	}

	/**
	 * Replaces the current structured page package used during HTML finalization.
	 */
	setPagePackage(pagePackage: PagePackageResult) {
		this.pagePackage = pagePackage;
		this.processedDependencies = this.resolvePagePackageHtmlDependencies(pagePackage);
	}

	/**
	 * Returns the processed dependencies queued for the next transform pass.
	 */
	getProcessedDependencies(): ProcessedAsset[] {
		return this.processedDependencies;
	}

	/**
	 * Returns the structured page package queued for the next transform pass.
	 */
	getPagePackage(): PagePackageResult | undefined {
		return this.pagePackage;
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
		return dedupeProcessedAssets(assets);
	}

	/**
	 * Injects the currently processed dependencies into an HTML response.
	 *
	 * @remarks
	 * Native or worker-tools HTML rewriter support is preferred when available. A
	 * string-based fallback remains in place for runtimes that cannot provide one
	 * of those rewriter implementations.
	 */
	async transform(res: Response, contributions: HtmlDocumentContribution[] = []): Promise<Response> {
		const { head, body } = this.groupDependenciesByPosition();
		const { headPrepend, headAppend, bodyPrepend, bodyAppend } = this.groupContributionsByPlacement(contributions);
		const htmlRewriter = await this.htmlRewriterProvider.createHtmlRewriter();

		if (htmlRewriter) {
			htmlRewriter
				.on('head', {
					element: (element) => {
						this.applyContributions(element, headPrepend, 'prepend');
						this.appendDependencies(element, head);
						this.applyContributions(element, headAppend, 'append');
					},
				})
				.on('body', {
					element: (element) => {
						this.applyContributions(element, bodyPrepend, 'prepend');
						this.appendDependencies(element, body);
						this.applyContributions(element, bodyAppend, 'append');
					},
				});

			return htmlRewriter.transform(res);
		}

		const html = await res.text();
		const headers = new Headers(res.headers);

		const withHeadPrependedContent = this.injectAfterOpeningTag(
			html,
			'head',
			headPrepend.map((item) => item.html).join(''),
		);
		const withHeadDependencies = this.injectBeforeClosingTag(
			withHeadPrependedContent,
			'head',
			`${this.buildDependencyTags(head)}${headAppend.map((item) => item.html).join('')}`,
		);
		const withBodyPrependedContent = this.injectAfterOpeningTag(
			withHeadDependencies,
			'body',
			bodyPrepend.map((item) => item.html).join(''),
		);
		const transformedHtml = this.injectBeforeClosingTag(
			withBodyPrependedContent,
			'body',
			`${this.buildDependencyTags(body)}${bodyAppend.map((item) => item.html).join('')}`,
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
		const dependencies = this.pagePackage
			? this.resolvePagePackageHtmlDependencies(this.pagePackage)
			: this.processedDependencies;

		return dependencies.reduce(
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

	private resolvePagePackageHtmlDependencies(pagePackage: PagePackageResult): ProcessedAsset[] {
		if (!pagePackage.pageBrowserGraph) {
			return pagePackage.htmlAssets;
		}

		const chunkKeys = new Set(
			pagePackage.pageBrowserGraph.chunkAssets.map((asset) => buildProcessedAssetDedupeKey(asset)),
		);
		const graphKeys = new Set(
			[...pagePackage.pageBrowserGraph.entryAssets, ...pagePackage.pageBrowserGraph.chunkAssets].map((asset) =>
				buildProcessedAssetDedupeKey(asset),
			),
		);
		const nonGraphHtmlAssets = pagePackage.htmlAssets.filter(
			(asset) => !graphKeys.has(buildProcessedAssetDedupeKey(asset)),
		);
		const entryHtmlAssets = pagePackage.pageBrowserGraph.entryAssets.filter(
			(asset) => !chunkKeys.has(buildProcessedAssetDedupeKey(asset)),
		);

		return dedupeProcessedAssets([...nonGraphHtmlAssets, ...entryHtmlAssets]);
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
