import { realpathSync } from 'node:fs';
import path from 'node:path';
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
import { findHtmlFilesLoading, getHtmlPageModuleScriptUrls, scanModuleScript } from './html-page-module-scripts.ts';
import { reconcileHtmlPageDocument, type RenderedHtmlPageHead } from './html-page-document.ts';
import {
	getBuiltInHtmlShell,
	getCompiledHtmlTemplate,
	HTML_PAGES_INTEGRATION_NAME,
	warnHtmlTemplateRender,
} from './html-page-module.ts';
import {
	findRelativeCssUrls,
	getHtmlAssetKey,
	type HtmlAssetDeclaration,
	type HtmlFileAssetKind,
	type HtmlTemplate,
	type HtmlTemplatePart,
} from './html-page-template.ts';

/**
 * Brackets the Page markup so it can be wrapped in a `<body>` when the shell
 * renders none, as JSX shells that leave `<body>` to Layouts do.
 */
const BODY_START_MARKER = '<!--eco:html-page-body-->';
const BODY_END_MARKER = '<!--/eco:html-page-body-->';

type HtmlFileAssetDeclaration = Extract<HtmlAssetDeclaration, { kind: HtmlFileAssetKind }>;
type HtmlPreloadDeclaration = Extract<HtmlAssetDeclaration, { kind: 'preload' }>;

/** A processed stylesheet or script, with the HTML file that declares it. */
type DeclaredFileAsset = { file: string; asset: HtmlFileAssetDeclaration };

/** Emitted URLs of one {@link HtmlPageRenderer.emitAssets} call, keyed by kind and file. */
type EmittedUrls = Map<string, Promise<string>>;

const FILE_ASSET_LABELS: Record<HtmlFileAssetKind, { name: string; preload: string }> = {
	stylesheet: { name: 'a stylesheet', preload: '<link rel="preload" as="style">' },
	'module-script': { name: 'a module script', preload: '<link rel="modulepreload">' },
	'classic-script': { name: 'a classic script', preload: '<link rel="preload" as="script">' },
};

function declaredFileAssets(template: HtmlTemplate | undefined): DeclaredFileAsset[] {
	if (!template) return [];
	const { file } = template;
	return template.assets.flatMap((asset) =>
		asset.kind === 'inline-style' || asset.kind === 'preload' ? [] : [{ file, asset }],
	);
}

function spliceUrl(asset: HtmlFileAssetDeclaration | HtmlPreloadDeclaration, url: string): string {
	return `${asset.tag.slice(0, asset.urlStart)}"${escapeHtmlAttribute(url)}"${asset.tag.slice(asset.urlEnd)}`;
}

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
 *
 * Without HMR, module scripts come from one build of every HTML Page's and the
 * shell's module scripts ({@link getHtmlPageModuleScriptUrls}); with HMR they go
 * to the HMR manager, which serves each source module at one URL.
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
				await this.emitAssets(template, declaredFileAssets(template)),
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

		const template = getCompiledHtmlTemplate(options.HtmlTemplate);
		const shell = template?.kind === 'shell' ? template : undefined;
		const emitted = new Set(shell?.assets.flatMap((asset) => getHtmlAssetKey(asset) ?? []) ?? []);
		const tags = await this.emitAssets(page, [...declaredFileAssets(shell), ...declaredFileAssets(page)], emitted);
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

	/**
	 * Emits the tag of each asset, except assets whose key is in `skip`, which get an empty string.
	 * A preload hint takes the URL of the first of `targets` with its file and the kind it preloads.
	 */
	private emitAssets(
		template: HtmlTemplate,
		targets: readonly DeclaredFileAsset[],
		skip?: ReadonlySet<string>,
	): Promise<string[]> {
		const urls: EmittedUrls = new Map();
		return Promise.all(
			template.assets.map(async (asset) =>
				skip?.has(getHtmlAssetKey(asset) ?? '') ? '' : this.emitAsset(template, asset, targets, urls),
			),
		);
	}

	private async emitAsset(
		template: HtmlTemplate,
		asset: HtmlAssetDeclaration,
		targets: readonly DeclaredFileAsset[],
		urls: EmittedUrls,
	): Promise<string> {
		const { file } = template;
		if (asset.kind === 'inline-style') {
			const processed = await this.processAsset(
				AssetFactory.createInlineContentStylesheet({ content: asset.content, processingOrigin: `${file}.css` }),
			);
			invariant(
				processed?.content !== undefined,
				`${file}: could not process an inline <style>; the asset pipeline logged the cause.`,
			);
			for (const url of findRelativeCssUrls(processed.content)) {
				warnHtmlTemplateRender(
					file,
					`style-url:${url}`,
					() =>
						`${file}: url(${url}) in a processed <style> is left as written, so the browser resolves it against the route URL. Move the file to the public directory and use a root-relative URL.`,
				);
			}
			return `${asset.tag.slice(0, asset.contentStart)}${escapeStyleContent(processed.content)}${asset.tag.slice(asset.contentEnd)}`;
		}

		if (asset.kind === 'preload') {
			return this.emitPreload(template, asset, targets, urls);
		}

		return spliceUrl(asset, await this.fileUrl({ file, asset }, urls));
	}

	private async emitPreload(
		template: HtmlTemplate,
		asset: HtmlPreloadDeclaration,
		targets: readonly DeclaredFileAsset[],
		urls: EmittedUrls,
	): Promise<string> {
		const target = targets.find(
			(candidate) => candidate.asset.filepath === asset.filepath && candidate.asset.kind === asset.preloads,
		);
		if (target) {
			if (asset.integrity) {
				throw new Error(
					`[ecopages] ${template.file}: the preload for "${asset.reference}" has an integrity attribute, but core points it at the processed file, so the digest would no longer match. Remove the attribute.`,
				);
			}
			return spliceUrl(asset, await this.fileUrl(target, urls));
		}
		warnHtmlTemplateRender(template.file, `preload:${asset.reference}`, () =>
			this.describeUnmatchedPreload(template, asset, targets),
		);
		return asset.tag;
	}

	/**
	 * @remarks
	 * Looks for other HTML files that load the file only for a preload of a stylesheet or script,
	 * because that compiles every HTML file; {@link warnHtmlTemplateRender} calls this at most once
	 * per revision of the file.
	 */
	private describeUnmatchedPreload(
		template: HtmlTemplate,
		asset: HtmlPreloadDeclaration,
		targets: readonly DeclaredFileAsset[],
	): string {
		const subject = `${template.file}: the preload for "${asset.reference}"`;
		const sameFile = targets.find((candidate) => candidate.asset.filepath === asset.filepath);
		if (sameFile) {
			const { name, preload } = FILE_ASSET_LABELS[sameFile.asset.kind];
			return `${subject} names ${name}, so it is left as written. Use ${preload} to preload ${name}.`;
		}
		const loaders = asset.preloads ? findHtmlFilesLoading(this.appConfig, asset.filepath, template.file) : [];
		if (loaders.length > 0) {
			const names = loaders.map((loader) => path.relative(this.appConfig.rootDir, loader)).join(', ');
			return template.kind === 'shell'
				? `${subject} names a file only ${names} loads, so it is left as written. A preload in the shell can name only a file the shell loads; move it to the Pages that load the file.`
				: `${subject} names a file only ${names} loads, so it is left as written. Load the file on this Page too, or remove the preload.`;
		}
		const owner = template.kind === 'shell' ? 'the shell' : 'this Page or its shell';
		return `${subject} names no stylesheet or script ${owner} processes, so it is left as written and the browser resolves it against the route URL. Preload a processed file, or move the file to the public directory and use a root-relative URL.`;
	}

	private fileUrl({ file, asset }: DeclaredFileAsset, urls: EmittedUrls): Promise<string> {
		const key = `${asset.kind}:${asset.filepath}`;
		let url = urls.get(key);
		if (!url) {
			url = this.emitFileUrl(file, asset);
			urls.set(key, url);
		}
		return url;
	}

	private async emitFileUrl(file: string, asset: HtmlFileAssetDeclaration): Promise<string> {
		if (!fileSystem.exists(asset.filepath)) {
			throw new Error(`[ecopages] ${file}: "${asset.reference}" does not exist (${asset.filepath}).`);
		}

		if (asset.kind === 'module-script') {
			const hmr = this.assetProcessingService.getHmrManager()?.isEnabled() === true;
			if (!hmr) {
				const url = (await getHtmlPageModuleScriptUrls(this.appConfig)).get(realpathSync(asset.filepath));
				if (url !== undefined) return url;
			}
			this.assertNoStylesheetImport(file, asset.reference, asset.filepath);
			invariant(hmr, `${file}: "${asset.reference}" has no output in the HTML Page module script build.`);
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
		return processed.srcUrl;
	}

	/**
	 * @remarks
	 * Without HMR, the shared build leaves such a script out, so this runs only for a script with
	 * no output there. Paths in the error are relative to the app root. A `<link>` must point inside
	 * the source directory, so a stylesheet outside it, as in a package, has to be copied there.
	 */
	private assertNoStylesheetImport(file: string, reference: string, script: string): void {
		const found = scanModuleScript(this.appConfig, script).stylesheetImport;
		if (!found) return;
		const real = (target: string) => (fileSystem.exists(target) ? realpathSync(target) : target);
		const rootDir = real(this.appConfig.rootDir);
		const show = (target: string) =>
			path.isAbsolute(target) ? path.relative(rootDir, real(target)).split(path.sep).join('/') : target;
		const stylesheet = real(found.stylesheet);
		const through = found.importer === path.resolve(script) ? '' : ` through ${show(found.importer)}`;
		const srcDir = real(this.appConfig.absolutePaths.srcDir);
		const href = path
			.relative(path.dirname(real(file)), stylesheet)
			.split(path.sep)
			.join('/');
		const fix = stylesheet.startsWith(`${srcDir}${path.sep}`)
			? `Load it with <link rel="stylesheet" href="${href.startsWith('../') ? href : `./${href}`}"> in ${show(file)} instead.`
			: `A <link> cannot point outside ${show(srcDir)}, so copy the stylesheet under ${show(srcDir)} and link it from ${show(file)} instead.`;
		throw new Error(
			`[ecopages] ${show(file)}: "${reference}" imports ${show(stylesheet)}${through}, which a module script cannot add to the Page. ${fix}`,
		);
	}

	private async processAsset(definition: AssetDefinition) {
		const [processed] = await this.assetProcessingService.processDependencies([definition], this.name);
		return processed;
	}
}
