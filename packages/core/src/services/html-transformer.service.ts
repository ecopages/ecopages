import { appLogger } from '../global/app-logger.ts';
import type { AssetPosition, ProcessedAsset, ScriptAsset } from './asset-processing-service/assets.types';

type HtmlRewriterElement = {
	append(content: string, options?: { html?: boolean }): void;
};

type HtmlRewriterConstructor = new () => HtmlRewriterRuntime;

export type HtmlRewriterMode = 'auto' | 'native' | 'worker-tools' | 'fallback';

type HtmlRewriterRuntime = {
	on(selector: 'head' | 'body', handler: { element: (element: HtmlRewriterElement) => void }): HtmlRewriterRuntime;
	transform(response: Response): Response;
};

export interface HtmlTransformerServiceOptions {
	htmlRewriterMode?: HtmlRewriterMode;
}

export class HtmlTransformerService {
	private processedDependencies: ProcessedAsset[] = [];
	private htmlRewriterConstructorPromise?: Promise<HtmlRewriterConstructor | null>;
	private htmlRewriterMode: HtmlRewriterMode = 'auto';

	constructor(options: HtmlTransformerServiceOptions = {}) {
		this.setHtmlRewriterMode(options.htmlRewriterMode ?? 'auto');
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
		this.htmlRewriterMode = mode;
		this.htmlRewriterConstructorPromise = undefined;
	}

	/**
	 * Creates an HTML rewriter instance from the best available runtime.
	 *
	 * Resolution order is:
	 * 1. native `globalThis.HTMLRewriter`
	 * 2. `@worker-tools/html-rewriter/base64`
	 * 3. `null`, which triggers the string-based fallback path
	 *
	 * @returns HTML rewriter instance when available; otherwise `null`.
	 */
	private async createHtmlRewriter(): Promise<HtmlRewriterRuntime | null> {
		const RuntimeHtmlRewriter = await this.resolveHtmlRewriterConstructor();
		return RuntimeHtmlRewriter ? new RuntimeHtmlRewriter() : null;
	}

	private async loadWorkerToolsHtmlRewriter(): Promise<HtmlRewriterConstructor | null> {
		try {
			const module = await import('@worker-tools/html-rewriter/base64');
			return module.HTMLRewriter as HtmlRewriterConstructor;
		} catch (primaryError) {
			try {
				const runtimeLocalModule = await import(
					new URL('../node_modules/@worker-tools/html-rewriter/base64.js', import.meta.url).href,
				);
				return runtimeLocalModule.HTMLRewriter as HtmlRewriterConstructor;
			} catch {
				const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
				appLogger.warn(
					`[HtmlTransformerService] Failed to load @worker-tools/html-rewriter/base64, falling back to string injection: ${message}`,
				);
				return null;
			}
		}
	}

	/**
	 * Resolves the constructor used for HTML rewriting.
	 *
	 * The worker-tools fallback is loaded lazily so native runtimes avoid the WASM
	 * dependency cost unless it is actually needed.
	 *
	 * @returns Rewriter constructor when available; otherwise `null`.
	 */
	private async resolveHtmlRewriterConstructor(): Promise<HtmlRewriterConstructor | null> {
		if (!this.htmlRewriterConstructorPromise) {
			const mode = this.htmlRewriterMode;
			const RuntimeHtmlRewriter = (globalThis as { HTMLRewriter?: HtmlRewriterConstructor }).HTMLRewriter;

			if (mode === 'fallback') {
				this.htmlRewriterConstructorPromise = Promise.resolve(null);
			} else if (mode === 'native') {
				if (RuntimeHtmlRewriter) {
					this.htmlRewriterConstructorPromise = Promise.resolve(RuntimeHtmlRewriter);
				} else {
					appLogger.warn(
						'[HtmlTransformerService] Native HTMLRewriter was forced but is unavailable, falling back to string injection.',
					);
					this.htmlRewriterConstructorPromise = Promise.resolve(null);
				}
			} else if (mode === 'auto' && RuntimeHtmlRewriter) {
				this.htmlRewriterConstructorPromise = Promise.resolve(RuntimeHtmlRewriter);
			} else {
				this.htmlRewriterConstructorPromise = this.loadWorkerToolsHtmlRewriter();
			}
		}

		return this.htmlRewriterConstructorPromise;
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

	setProcessedDependencies(processedDependencies: ProcessedAsset[]) {
		this.processedDependencies = processedDependencies;
	}

	getProcessedDependencies(): ProcessedAsset[] {
		return this.processedDependencies;
	}

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

	async transform(res: Response): Promise<Response> {
		const { head, body } = this.groupDependenciesByPosition();
		const htmlRewriter = await this.createHtmlRewriter();

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

	private buildAttributeString(attributes: Record<string, string>): string {
		return Object.entries(attributes)
			.filter(([key, value]) => key.length > 0 && value.length > 0)
			.map(([key, value]) => ` ${key}="${value}"`)
			.join('');
	}
}
