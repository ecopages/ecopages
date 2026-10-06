import { fileSystem } from '@ecopages/file-system';
import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoPagesElement,
	HtmlTemplateProps,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '../types/public-types.ts';
import { AssetFactory } from '../services/assets/asset-processing-service/asset.factory.ts';
import type { AssetDefinition } from '../services/assets/asset-processing-service/assets.types.ts';
import { StringMarkupRenderer } from '../route-renderer/orchestration/string-markup-renderer.ts';
import type { RouteRenderOrchestratorAdapter } from '../route-renderer/orchestration/route-pipeline/route-render-orchestrator.ts';
import { findElements, parseHtml } from '../services/html/html-source-parser.ts';
import { escapeHtmlAttribute } from '../utils/html-escaping.ts';
import { invariant } from '../utils/invariant.ts';
import { resolveClassicScriptOptions } from './html-page-classic-script.ts';
import { reconcileHtmlPageDocument, type RenderedHtmlPageHead } from './html-page-document.ts';
import { getBuiltInHtmlShell, getCompiledHtmlTemplate, HTML_PAGES_INTEGRATION_NAME } from './html-page-module.ts';
import {
	getHtmlAssetKey,
	type HtmlAssetDeclaration,
	type HtmlTemplate,
	type HtmlTemplatePart,
} from './html-page-template.ts';

/**
 * Brackets the Page markup so it can be wrapped in a `<body>` when the shell
 * renders none, as JSX shells that leave `<body>` to Layouts do.
 */
const BODY_START_MARKER = '<!--eco:html-page-body-->';
const BODY_END_MARKER = '<!--/eco:html-page-body-->';

/**
 * @remarks
 * Processed CSS can contain `</style`, as when a Processor inlines an `@import`d file, and the browser would
 * close the element there. `<\/style` reads as the same characters in CSS.
 */
function escapeStyleContent(css: string): string {
	return css.replace(/<(\/style)/gi, '<\\$1');
}

/**
 * Renders HTML Pages and the `html.html` Html shell.
 *
 * @remarks
 * Processed asset tags are emitted where the author wrote them, so they bypass
 * the head and body dependency slots. A local file declared by both the shell
 * and the Page is emitted once, by the shell; within one file, the first
 * declaration wins. Page head tags and root attributes are applied to the
 * finalized document by {@link reconcileHtmlPageDocument}.
 */
export class HtmlPageRenderer extends StringMarkupRenderer {
	name = HTML_PAGES_INTEGRATION_NAME;

	protected override async getHtmlTemplate(): Promise<EcoComponent<HtmlTemplateProps>> {
		const htmlTemplatePath = this.appConfig.absolutePaths.htmlTemplatePath;
		if (!htmlTemplatePath || !fileSystem.exists(htmlTemplatePath)) {
			return getBuiltInHtmlShell() as EcoComponent<HtmlTemplateProps>;
		}
		return super.getHtmlTemplate();
	}

	/**
	 * Renders the `html.html` shell, including when a Page owned by another
	 * Integration delegates its Html shell here.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const template = getCompiledHtmlTemplate(input.component);
		if (template?.kind !== 'shell') {
			return super.renderComponent(input);
		}

		return this.renderStringComponentWithQueuedForeignSubtrees(input, async (props) =>
			this.joinParts(
				template,
				template.parts,
				await this.emitAssets(template),
				new Set(),
				String(props.children ?? ''),
			),
		);
	}

	/**
	 * @remarks
	 * Route renders go through the orchestrator adapter, which reconciles the Page head after
	 * core contributions are in the document. A direct call reconciles here, so the Page head
	 * is never dropped.
	 */
	override async render(options: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		const { html, head } = await this.renderHtmlPage(options);
		return reconcileHtmlPageDocument(html, head);
	}

	/**
	 * Reconciles the Page head after core and Integration head contributions are in the document.
	 *
	 * @remarks
	 * The adapter is created per route render, so the rendered head it captures
	 * cannot leak into another render.
	 */
	protected override createRouteRenderOrchestratorAdapter(): RouteRenderOrchestratorAdapter<EcoPagesElement> {
		const adapter = super.createRouteRenderOrchestratorAdapter();
		let head: RenderedHtmlPageHead | undefined;

		return {
			...adapter,
			renderRouteBody: async (renderOptions) => {
				const rendered = await this.renderHtmlPage(renderOptions);
				head = rendered.head;
				return rendered.html;
			},
			transformRouteResponse: async (response, htmlContributions, pagePackage) => {
				const body = await adapter.transformRouteResponse(response, htmlContributions, pagePackage);
				return head ? reconcileHtmlPageDocument(await new Response(body as BodyInit).text(), head) : body;
			},
		};
	}

	private async renderHtmlPage(
		options: IntegrationRendererRenderOptions,
	): Promise<{ html: string; head: RenderedHtmlPageHead }> {
		const page = getCompiledHtmlTemplate(options.Page);
		invariant(page?.kind === 'page', `${this.name} renderer expected an HTML Page for ${options.file}.`);

		const shell = getCompiledHtmlTemplate(options.HtmlTemplate);
		const emitted = new Set(
			shell?.kind === 'shell' ? shell.assets.flatMap((asset) => getHtmlAssetKey(asset) ?? []) : [],
		);
		const tags = await this.emitAssets(page);
		const head = page.head.map(({ parts, key, charset }) => ({
			html: this.joinParts(page, parts, tags, emitted),
			key,
			charset,
		}));
		const body = `${BODY_START_MARKER}${this.joinParts(page, page.body, tags, emitted)}${BODY_END_MARKER}`;
		const Body = Object.assign(() => body, { config: options.Page.config }) as EcoComponent;

		const html = await this.renderPageWithDocumentShell({
			page: { component: Body, props: {} },
			htmlTemplate: options.HtmlTemplate,
			metadata: options.metadata,
			pageProps: options.pageProps ?? {},
			foreignChildRoots: options.resolvedPageDependencyComponents,
		});
		const hasBody = findElements(parseHtml(html), (element) => element.tagName === 'body').length > 0;

		return {
			html: html
				.replace(BODY_START_MARKER, hasBody ? '' : '<body>')
				.replace(BODY_END_MARKER, hasBody ? '' : '</body>'),
			head: {
				file: page.file,
				nodes: head,
				htmlAttributes: page.htmlAttributes,
				bodyAttributes: page.bodyAttributes,
			},
		};
	}

	/**
	 * Joins template parts, skipping file assets whose key is already in `emitted`
	 * and adding the key of each asset it emits.
	 */
	private joinParts(
		template: HtmlTemplate,
		parts: readonly HtmlTemplatePart[],
		tags: readonly string[],
		emitted: Set<string>,
		children = '',
	): string {
		let html = '';
		for (const part of parts) {
			if (typeof part === 'string') {
				html += part;
			} else if ('slot' in part) {
				html += children;
			} else {
				const key = getHtmlAssetKey(template.assets[part.asset]!);
				if (key) {
					if (emitted.has(key)) continue;
					emitted.add(key);
				}
				html += tags[part.asset];
			}
		}
		return html;
	}

	private emitAssets(template: HtmlTemplate): Promise<string[]> {
		return Promise.all(template.assets.map((asset) => this.emitAsset(template.file, asset)));
	}

	private async emitAsset(file: string, asset: HtmlAssetDeclaration): Promise<string> {
		if (asset.kind === 'inline-style') {
			const processed = await this.processAsset(
				AssetFactory.createInlineContentStylesheet({ content: asset.content, processingOrigin: `${file}.css` }),
			);
			invariant(
				processed?.content !== undefined,
				`${file}: could not process an inline <style>; the asset pipeline logged the cause.`,
			);
			return `${asset.tag.slice(0, asset.contentStart)}${escapeStyleContent(processed.content)}${asset.tag.slice(asset.contentEnd)}`;
		}

		if (!fileSystem.exists(asset.filepath)) {
			throw new Error(`[ecopages] ${file}: "${asset.reference}" does not exist (${asset.filepath}).`);
		}

		const processed = await this.processAsset(
			asset.kind === 'stylesheet'
				? AssetFactory.createFileStylesheet({ filepath: asset.filepath })
				: AssetFactory.createFileScript({
						filepath: asset.filepath,
						...(asset.kind === 'classic-script'
							? resolveClassicScriptOptions(file, asset.reference, asset.filepath)
							: {}),
					}),
		);
		invariant(
			processed?.srcUrl !== undefined,
			`${file}: could not process "${asset.reference}"; the asset pipeline logged the cause.`,
		);
		return `${asset.tag.slice(0, asset.urlStart)}"${escapeHtmlAttribute(processed.srcUrl)}"${asset.tag.slice(asset.urlEnd)}`;
	}

	private async processAsset(definition: AssetDefinition) {
		const [processed] = await this.assetProcessingService.processDependencies([definition], this.name);
		return processed;
	}
}
