import { appLogger } from '../global/app-logger.ts';
import type { AssetPosition, ProcessedAsset, ScriptAsset } from './asset-processing-service/assets.types';

type HtmlRewriterElement = {
	append(content: string, options?: { html?: boolean }): void;
};

type HtmlRewriterConstructor = new () => HtmlRewriterRuntime;

type HtmlRewriterRuntime = {
	on(selector: 'head' | 'body', handler: { element: (element: HtmlRewriterElement) => void }): HtmlRewriterRuntime;
	transform(response: Response): Response;
};

export class HtmlTransformerService {
	private processedDependencies: ProcessedAsset[] = [];
	private htmlRewriterConstructorPromise?: Promise<HtmlRewriterConstructor | null>;

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
			const RuntimeHtmlRewriter = (globalThis as { HTMLRewriter?: HtmlRewriterConstructor }).HTMLRewriter;
			if (RuntimeHtmlRewriter) {
				this.htmlRewriterConstructorPromise = Promise.resolve(RuntimeHtmlRewriter);
			} else {
				this.htmlRewriterConstructorPromise = import('@worker-tools/html-rewriter/base64')
					.then((module) => module.HTMLRewriter as HtmlRewriterConstructor)
					.catch((error: unknown) => {
						const message = error instanceof Error ? error.message : String(error);
						appLogger.warn(
							`[HtmlTransformerService] Failed to load @worker-tools/html-rewriter/base64, falling back to string injection: ${message}`,
						);
						return null;
					});
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
}
