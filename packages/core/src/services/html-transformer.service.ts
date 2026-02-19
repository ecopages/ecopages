import type { AssetPosition, ProcessedAsset, ScriptAsset } from './asset-processing-service/assets.types';

type HtmlRewriterElement = {
	append(content: string, options?: { html?: boolean }): void;
};

type HtmlRewriterRuntime = {
	on(selector: 'head' | 'body', handler: { element: (element: HtmlRewriterElement) => void }): HtmlRewriterRuntime;
	transform(response: Response): Response;
};

export class HtmlTransformerService {
	htmlRewriter: HtmlRewriterRuntime | null;
	constructor(private processedDependencies: ProcessedAsset[] = []) {
		this.htmlRewriter = this.createHtmlRewriter();
	}

	private createHtmlRewriter(): HtmlRewriterRuntime | null {
		const RuntimeHtmlRewriter = (globalThis as { HTMLRewriter?: new () => HtmlRewriterRuntime }).HTMLRewriter;
		if (!RuntimeHtmlRewriter) {
			return null;
		}

		return new RuntimeHtmlRewriter();
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

		const html = await res.text();
		const headers = new Headers(res.headers);

		if (this.htmlRewriter) {
			this.htmlRewriter
				.on('head', {
					element: (element) => this.appendDependencies(element, head),
				})
				.on('body', {
					element: (element) => this.appendDependencies(element, body),
				});

			return this.htmlRewriter.transform(
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
