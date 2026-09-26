import type { AssetPosition, ProcessedAsset, ScriptAsset } from '../assets/asset-processing-service/assets.types.ts';
import type { PagePackageResult } from '../../types/public-types.ts';
import { HtmlRewriter, rewriteFirstElement, type HtmlRewriterAttributeTarget } from './html-rewriter.ts';
import {
	buildProcessedAssetDedupeKey,
	dedupeProcessedAssets,
} from '../../route-renderer/orchestration/page-browser-graph/processed-asset-dedupe.ts';

export type HtmlDocumentContributionPlacement = 'head-prepend' | 'head-append' | 'body-prepend' | 'body-append';

export type HtmlDocumentContribution = {
	placement: HtmlDocumentContributionPlacement;
	html: string;
};

export class HtmlTransformerService {
	private processedDependencies: ProcessedAsset[] = [];
	private pagePackage?: PagePackageResult;

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

	private buildDependencyTags(dependencies: ProcessedAsset[]): string {
		return dependencies
			.map((dep) =>
				dep.kind === 'script' ? this.generateScriptTag(dep as ScriptAsset) : this.generateStylesheetTag(dep),
			)
			.join('');
	}

	private joinContributions(contributions: HtmlDocumentContribution[], placement: HtmlDocumentContributionPlacement) {
		return contributions
			.filter((item) => item.placement === placement)
			.map((item) => item.html)
			.join('');
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
	 * Sets attributes on the first `<html>` start tag.
	 */
	applyAttributesToHtmlElement(html: string, attributes: Record<string, string>): string {
		return stampAttributes(html, attributes, (element) => element.tagName === 'html');
	}

	/**
	 * Sets attributes on the element that directly follows the `<body>` start tag.
	 *
	 * @remarks
	 * Nothing is stamped when text or a comment comes first (whitespace aside).
	 */
	applyAttributesToFirstBodyElement(html: string, attributes: Record<string, string>): string {
		let insideBody = false;
		return stampAttributes(
			html,
			attributes,
			(element) => {
				if (insideBody) return true;
				insideBody = element.tagName === 'body';
				return false;
			},
			{ leadingOnly: true },
		);
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
	 * Injects the queued dependencies and document contributions into a streaming
	 * HTML response.
	 */
	transform(
		res: Response,
		contributions: HtmlDocumentContribution[] = [],
		pagePackage?: PagePackageResult,
	): Response {
		return this.createRewriter(contributions, pagePackage).transform(res);
	}

	/**
	 * Injects the queued dependencies and document contributions into a complete
	 * HTML string.
	 */
	transformHtml(
		html: string,
		contributions: HtmlDocumentContribution[] = [],
		pagePackage?: PagePackageResult,
	): string {
		return this.createRewriter(contributions, pagePackage).transform(html);
	}

	/**
	 * @remarks
	 * Each slot is inserted as one joined string, so contributions and assets keep
	 * their array order even though repeated `prepend` calls insert in reverse.
	 * Documents without a `<head>` or `<body>` element, or whose element never
	 * closes, skip the matching head or body injections (lol-html semantics).
	 */
	private createRewriter(contributions: HtmlDocumentContribution[], pagePackage?: PagePackageResult) {
		const { head, body } = this.groupDependenciesByPosition(pagePackage);
		const slots = {
			head: {
				prepend: this.joinContributions(contributions, 'head-prepend'),
				append: `${this.buildDependencyTags(head)}${this.joinContributions(contributions, 'head-append')}`,
			},
			body: {
				prepend: this.joinContributions(contributions, 'body-prepend'),
				append: `${this.buildDependencyTags(body)}${this.joinContributions(contributions, 'body-append')}`,
			},
		};

		const rewriter = new HtmlRewriter();
		for (const [tagName, slot] of Object.entries(slots)) {
			if (!slot.prepend && !slot.append) continue;
			rewriter.on(tagName, {
				element(element) {
					if (slot.prepend) element.prepend(slot.prepend, { html: true });
					if (slot.append) element.append(slot.append, { html: true });
				},
			});
		}
		return rewriter;
	}

	/**
	 * Splits processed assets into head and body injection groups.
	 */
	private groupDependenciesByPosition(pagePackageOverride?: PagePackageResult) {
		const dependencies = pagePackageOverride
			? this.resolvePagePackageHtmlDependencies(pagePackageOverride)
			: this.pagePackage
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
}

/**
 * Sets attributes on the element a fragment or document starts with.
 *
 * @remarks
 * Nothing is stamped when text or a comment comes first (whitespace aside),
 * so a Lit render that opens with `<!--lit-part-->` keeps its markup.
 */
export function applyAttributesToFirstElement(html: string, attributes: Record<string, string>): string {
	return stampAttributes(html, attributes, () => true, { leadingOnly: true });
}

/**
 * Sets `attributes` on the first element that `isTarget` accepts.
 *
 * @remarks
 * Entries with an empty name or value are skipped, and an attribute the element
 * already has is replaced rather than duplicated.
 */
function stampAttributes(
	html: string,
	attributes: Record<string, string>,
	isTarget: (element: HtmlRewriterAttributeTarget) => boolean,
	options?: { leadingOnly?: boolean },
): string {
	const entries = Object.entries(attributes).filter(([name, value]) => name.length > 0 && value.length > 0);
	if (entries.length === 0) return html;

	return rewriteFirstElement(
		html,
		isTarget,
		(element) => {
			for (const [name, value] of entries) element.setAttribute(name, value);
		},
		options,
	);
}
