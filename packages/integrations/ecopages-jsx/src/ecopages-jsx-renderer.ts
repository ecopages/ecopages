import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoFunctionComponent,
	EcoComponentConfig,
	EcoPageFile,
	GetMetadata,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { rapidhash } from '@ecopages/core/hash';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
	IntegrationRenderer,
	type RenderToResponseContext,
	type RouteModuleLoadOptions,
} from '@ecopages/core/route-renderer/integration-renderer';
import type { ProcessedAsset } from '@ecopages/core/services/asset-processing-service';
import { createMarkupNodeLike, type JsxRenderable } from '@ecopages/jsx';
import { renderToString, withServerCustomElementRenderHook } from '@ecopages/jsx/server';
import { ECOPAGES_JSX_PLUGIN_NAME } from './ecopages-jsx.constants.ts';
import type { EcopagesJsxRendererOptions } from './ecopages-jsx.types.ts';

export type { EcopagesJsxRendererConfig, EcopagesJsxRendererOptions } from './ecopages-jsx.types.ts';

type EcopagesJsxForeignSubtreeResolutionContext = {
	rendererCache: Map<string, IntegrationRenderer<any>>;
	componentInstanceScope?: string;
	nextForeignSubtreeId: number;
	queuedResolutions: Array<{
		token: string;
		component: EcoComponent;
		props: Record<string, unknown>;
		componentInstanceId: string;
	}>;
};

type AsyncEcoComponent<P = Record<string, unknown>, R = JsxRenderable> = EcoFunctionComponent<P, R | Promise<R>>;

type MdxPageModule = EcoPageFile<{
	config?: EcoComponentConfig;
	layout?: EcoComponent;
	getMetadata?: GetMetadata;
}>;

/**
 * Local Ecopages renderer for JSX templates in the docs app.
 *
 * This keeps the integration scoped to the docs package while supporting
 * async page, layout, and html template components on the server.
 */
export class EcopagesJsxRenderer extends IntegrationRenderer<JsxRenderable> {
	name = ECOPAGES_JSX_PLUGIN_NAME;

	private static radiantServerRuntimeInstallPromise: Promise<void> | undefined;
	private static readonly SCRIPT_IMPORT_RE =
		/import\s+(?:[^'";]+\s+from\s+)?['"](\.[^'"\n]*\.script(?:\.[cm]?[jt]sx?)?)['"]/g;

	private readonly intrinsicCustomElementAssets: Map<string, readonly ProcessedAsset[]>;
	private readonly intrinsicCustomElementScriptFiles: Map<string, string>;
	private collectedAssetFrames: ProcessedAsset[][] = [];
	private importedIntrinsicScriptFrames: Set<string>[] = [];
	private readonly mdxExtensions: string[];
	private readonly radiantSsrEnabled: boolean;

	/**
	 * Re-renders queued JSX children inside the owning renderer so nested custom
	 * elements and queued foreign subtrees contribute assets to the same frame.
	 */
	private async renderQueuedForeignSubtreeChildren(
		children: unknown,
		queuedResolutionsByToken: Map<string, EcopagesJsxForeignSubtreeResolutionContext['queuedResolutions'][number]>,
		resolveToken: (token: string) => Promise<string>,
	): Promise<{ assets: ProcessedAsset[]; html?: string }> {
		if (children === undefined) {
			return { assets: [] };
		}

		let assets: ProcessedAsset[] = [];
		let html: string;

		if (typeof children === 'string') {
			html = children;
		} else {
			const renderedChildren = await this.renderJsx(children as JsxRenderable);
			html = renderedChildren.html;
			assets = renderedChildren.assets;
		}
		html = await this.resolveQueuedForeignSubtreeTokens(html, queuedResolutionsByToken, resolveToken);

		return {
			assets,
			html,
		};
	}

	/**
	 * Resolves queued foreign subtrees after JSX has been stringified.
	 *
	 * JSX content needs one extra render pass because child foreign subtrees may emit
	 * additional browser assets while also replacing placeholder tokens.
	 */
	private async resolveOwnedForeignSubtreeHtml(
		html: string,
		runtimeContext: EcopagesJsxForeignSubtreeResolutionContext | undefined,
	): Promise<{ assets: ProcessedAsset[]; html: string }> {
		return this.resolveRendererOwnedQueuedForeignSubtreeHtml({
			html,
			runtimeContext,
			queueLabel: 'Ecopages JSX',
			renderQueuedChildren: async (children, _runtimeContext, queuedResolutionsByToken, resolveToken) =>
				this.renderQueuedForeignSubtreeChildren(children, queuedResolutionsByToken, resolveToken),
		});
	}

	constructor({
		appConfig,
		assetProcessingService,
		resolvedIntegrationDependencies,
		jsxConfig,
		runtimeOrigin,
	}: EcopagesJsxRendererOptions) {
		super({
			appConfig,
			assetProcessingService,
			resolvedIntegrationDependencies,
			runtimeOrigin,
		});

		this.intrinsicCustomElementAssets = jsxConfig?.intrinsicCustomElementAssets ?? new Map();
		this.intrinsicCustomElementScriptFiles = jsxConfig?.intrinsicCustomElementScriptFiles ?? new Map();
		this.mdxExtensions = jsxConfig?.mdxExtensions ?? ['.mdx'];
		this.radiantSsrEnabled = jsxConfig?.radiantSsrEnabled ?? false;
	}

	/** Returns whether the requested page file should be treated as MDX. */
	public isMdxFile(filePath: string): boolean {
		return this.mdxExtensions.some((ext) => filePath.endsWith(ext));
	}

	protected override async importPageFile(file: string, options?: RouteModuleLoadOptions): Promise<MdxPageModule> {
		await this.ensureRadiantServerRuntimeIfEnabled();

		const module = (await super.importPageFile(file, options)) as MdxPageModule;

		return this.isMdxFile(file) ? this.normalizeMdxPageModule(file, module) : module;
	}

	override async render(options: IntegrationRendererRenderOptions<JsxRenderable>): Promise<RouteRendererBody> {
		const importedScriptFrame = this.beginImportedIntrinsicScriptFrame([
			options.Page,
			options.Layout,
			options.HtmlTemplate,
		]);

		try {
			return await this.renderPageWithDocumentShell({
				page: {
					component: options.Page,
					props: {
						...options.pageProps,
						locals: options.pageLocals,
					},
				},
				layout: options.Layout
					? {
							component: options.Layout,
							props: {
								...options.pageProps,
								locals: options.locals,
							},
						}
					: undefined,
				htmlTemplate: options.HtmlTemplate,
				metadata: options.metadata,
				pageProps: options.pageProps ?? {},
			});
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		} finally {
			this.endImportedIntrinsicScriptFrame(importedScriptFrame);
		}
	}

	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const importedScriptFrame = this.beginImportedIntrinsicScriptFrame([input.component]);
		const assetFrame = this.beginCollectedAssetFrame();

		try {
			if (!this.isFunctionComponent(input.component)) {
				throw new TypeError('JSX renderer expected a callable component.');
			}

			const content = await this.renderEcoComponent(input.component, this.createComponentProps(input));
			const rendered = await this.renderJsx(content);
			const queuedForeignSubtreeResolution = await this.resolveOwnedForeignSubtreeHtml(
				rendered.html,
				this.getQueuedForeignSubtreeResolutionContext<EcopagesJsxForeignSubtreeResolutionContext>(input),
			);
			const componentAssets = await this.collectComponentAssets(input.component);
			const assets = this.htmlTransformer.dedupeProcessedAssets([
				...this.endCollectedAssetFrame(assetFrame),
				...queuedForeignSubtreeResolution.assets,
				...componentAssets,
			]);

			return {
				html: queuedForeignSubtreeResolution.html,
				canAttachAttributes: true,
				rootTag: this.getRootTagName(queuedForeignSubtreeResolution.html),
				integrationName: this.name,
				assets,
			};
		} catch (error) {
			this.endCollectedAssetFrame(assetFrame);
			throw this.createRenderError('Error rendering component', error);
		} finally {
			this.endImportedIntrinsicScriptFrame(importedScriptFrame);
		}
	}

	protected override createForeignChildRuntime(options: {
		renderInput: ComponentRenderInput;
		rendererCache: Map<string, IntegrationRenderer<any>>;
	}) {
		return this.createQueuedForeignSubtreeResolutionRuntime<EcopagesJsxForeignSubtreeResolutionContext>({
			renderInput: options.renderInput,
			rendererCache: options.rendererCache,
		});
	}

	override async renderToResponse<P = any>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		const importedScriptFrame = this.beginImportedIntrinsicScriptFrame([view, view.config?.layout]);
		try {
			if (!this.isFunctionComponent(view)) {
				throw new TypeError('JSX renderer expected a callable view component.');
			}

			return await this.renderViewWithDocumentShell({
				view,
				props: props as Record<string, unknown>,
				ctx,
				layout: view.config?.layout,
			});
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		} finally {
			this.endImportedIntrinsicScriptFrame(importedScriptFrame);
		}
	}

	/**
	 * Normalizes MDX modules into the same page contract as JSX route modules.
	 *
	 * MDX files export page metadata alongside generated component code, so the
	 * renderer folds those exports back into the Ecopages component shape before
	 * any layout or document-shell logic runs.
	 */
	private normalizeMdxPageModule(file: string, module: MdxPageModule): MdxPageModule {
		if (!this.isFunctionComponent(module.default)) {
			throw new TypeError('MDX file must export a callable default component.');
		}

		const Page = module.default;
		const normalizedConfig: EcoComponentConfig = {
			...(module.config ?? Page.config ?? {}),
			...(module.layout ? { layout: module.layout } : {}),
			__eco: module.config?.__eco ?? Page.config?.__eco ?? this.createEcoMeta(file),
		};
		const wrappedPage = this.wrapMdxPage(Page, {
			config: normalizedConfig,
			metadata: module.getMetadata ?? Page.metadata,
		});

		return {
			...module,
			default: wrappedPage,
			config: normalizedConfig,
		};
	}

	private beginCollectedAssetFrame(): ProcessedAsset[] {
		const frame: ProcessedAsset[] = [];
		this.collectedAssetFrames.push(frame);
		return frame;
	}

	private endCollectedAssetFrame(frame: ProcessedAsset[]): ProcessedAsset[] {
		const activeFrame = this.collectedAssetFrames.pop();

		if (!activeFrame || activeFrame !== frame) {
			return this.htmlTransformer.dedupeProcessedAssets(frame);
		}

		return this.htmlTransformer.dedupeProcessedAssets(activeFrame);
	}

	private async renderJsx(value: JsxRenderable): Promise<{ assets: ProcessedAsset[]; html: string }> {
		await this.ensureRadiantServerRuntimeIfEnabled();

		const collectedAssets: ProcessedAsset[] = [];
		const html = withServerCustomElementRenderHook(
			this.createIntrinsicCustomElementRenderHook(collectedAssets),
			() => renderToString(value),
		);
		const dedupedAssets = this.recordCollectedAssets(collectedAssets);

		return {
			assets: dedupedAssets,
			html,
		};
	}

	private async renderEcoComponent<P>(component: AsyncEcoComponent<P>, props: P): Promise<JsxRenderable> {
		await this.ensureRadiantServerRuntimeIfEnabled();

		const collectedAssets: ProcessedAsset[] = [];
		const rendered = await withServerCustomElementRenderHook(
			this.createIntrinsicCustomElementRenderHook(collectedAssets),
			() => this.invokeComponent(component, props),
		);
		this.recordCollectedAssets(collectedAssets);

		return rendered;
	}

	private recordCollectedAssets(collectedAssets: ProcessedAsset[]): ProcessedAsset[] {
		const dedupedAssets = this.htmlTransformer.dedupeProcessedAssets(collectedAssets);
		const activeFrame = this.collectedAssetFrames[this.collectedAssetFrames.length - 1];

		if (activeFrame) {
			activeFrame.push(...dedupedAssets);
		}

		return dedupedAssets;
	}

	private beginImportedIntrinsicScriptFrame(components: Array<EcoComponent | undefined>): Set<string> {
		const frame = this.collectImportedIntrinsicScriptFiles(components);
		this.importedIntrinsicScriptFrames.push(frame);
		return frame;
	}

	private endImportedIntrinsicScriptFrame(frame: Set<string>): void {
		const activeFrame = this.importedIntrinsicScriptFrames.pop();
		if (activeFrame !== frame) {
			this.importedIntrinsicScriptFrames = this.importedIntrinsicScriptFrames.filter((entry) => entry !== frame);
		}
	}

	private getActiveImportedIntrinsicScriptFiles(): Set<string> | undefined {
		return this.importedIntrinsicScriptFrames[this.importedIntrinsicScriptFrames.length - 1];
	}

	/**
	 * Collects intrinsic custom-element script files already owned by the current
	 * component tree through direct source imports or dependency declarations.
	 */
	private collectImportedIntrinsicScriptFiles(components: Array<EcoComponent | undefined>): Set<string> {
		const importedScriptFiles = new Set<string>();
		const visitedFiles = new Set<string>();

		const visit = (component: EcoComponent | undefined) => {
			const file = component?.config?.__eco?.file;
			if (!file || visitedFiles.has(file)) {
				return;
			}

			visitedFiles.add(file);

			for (const scriptFile of this.extractConfiguredDependencyScriptFiles(component, path.dirname(file))) {
				importedScriptFiles.add(scriptFile);
			}

			for (const scriptFile of this.extractImportedIntrinsicScriptFiles(file)) {
				importedScriptFiles.add(scriptFile);
			}

			for (const nestedComponent of component?.config?.dependencies?.components ?? []) {
				visit(nestedComponent);
			}

			visit(component?.config?.layout);
		};

		for (const component of components) {
			visit(component);
		}

		return importedScriptFiles;
	}

	private extractImportedIntrinsicScriptFiles(file: string): string[] {
		let source: string;
		try {
			source = readFileSync(file, 'utf8');
		} catch {
			return [];
		}

		const scriptFiles = new Set<string>();
		const directory = path.dirname(file);

		for (const match of source.matchAll(EcopagesJsxRenderer.SCRIPT_IMPORT_RE)) {
			const specifier = match[1];
			if (!specifier) {
				continue;
			}

			const resolvedScriptFile = this.resolveImportedIntrinsicScriptFile(directory, specifier);
			if (resolvedScriptFile) {
				scriptFiles.add(resolvedScriptFile);
			}
		}

		return [...scriptFiles];
	}

	private extractConfiguredDependencyScriptFiles(component: EcoComponent | undefined, directory: string): string[] {
		const scriptFiles = new Set<string>();

		for (const script of component?.config?.dependencies?.scripts ?? []) {
			const specifier = typeof script === 'string' ? script : script.src;
			if (!specifier) {
				continue;
			}

			const resolvedScriptFile = this.resolveImportedIntrinsicScriptFile(directory, specifier);
			if (resolvedScriptFile) {
				scriptFiles.add(resolvedScriptFile);
			}
		}

		return [...scriptFiles];
	}

	private resolveImportedIntrinsicScriptFile(directory: string, specifier: string): string | undefined {
		const basePath = path.resolve(directory, specifier);
		const candidatePaths = [
			basePath,
			`${basePath}.ts`,
			`${basePath}.tsx`,
			`${basePath}.js`,
			`${basePath}.jsx`,
			`${basePath}.mts`,
			`${basePath}.cts`,
			`${basePath}.mjs`,
			`${basePath}.cjs`,
		];

		for (const candidatePath of candidatePaths) {
			if (existsSync(candidatePath)) {
				return candidatePath;
			}
		}

		return undefined;
	}

	private async ensureRadiantServerRuntimeIfEnabled(): Promise<void> {
		if (!this.radiantSsrEnabled) {
			return;
		}

		await this.ensureRadiantServerRuntimeInstalled();
	}

	private async ensureRadiantServerRuntimeInstalled(): Promise<void> {
		if (!EcopagesJsxRenderer.radiantServerRuntimeInstallPromise) {
			EcopagesJsxRenderer.radiantServerRuntimeInstallPromise = Promise.all([
				import('@ecopages/radiant/server/render-component'),
				import('@ecopages/radiant/server/light-dom-shim').then((module) => {
					module.installLightDomShim();
				}),
			]).then(() => undefined);
		}

		await EcopagesJsxRenderer.radiantServerRuntimeInstallPromise;
	}

	private isFunctionComponent(component: EcoComponent): component is AsyncEcoComponent<Record<string, unknown>> {
		return typeof component === 'function';
	}

	private createComponentProps(input: ComponentRenderInput): Record<string, unknown> {
		if (input.children === undefined) {
			return input.props;
		}

		return {
			...input.props,
			children: typeof input.children === 'string' ? createMarkupNodeLike(input.children) : input.children,
		};
	}

	private async collectComponentAssets(component: EcoComponent): Promise<ProcessedAsset[]> {
		if (!component.config?.dependencies || typeof this.assetProcessingService?.processDependencies !== 'function') {
			return [];
		}

		return this.processComponentDependencies([component]);
	}

	private async invokeComponent<P>(component: AsyncEcoComponent<P>, props: P): Promise<JsxRenderable> {
		return await component(props);
	}

	private createEcoMeta(file: string): NonNullable<EcoComponentConfig['__eco']> {
		return {
			id: String(rapidhash(file)),
			file,
			integration: ECOPAGES_JSX_PLUGIN_NAME,
		};
	}

	private wrapMdxPage(
		page: AsyncEcoComponent<Record<string, unknown>>,
		{
			config,
			metadata,
		}: {
			config: EcoComponentConfig;
			metadata?: GetMetadata;
		},
	): AsyncEcoComponent<Record<string, unknown>> {
		const wrappedPage: AsyncEcoComponent<Record<string, unknown>> = async (props: Record<string, unknown>) =>
			await this.invokeComponent(page, props);

		wrappedPage.config = config;

		if (metadata) {
			wrappedPage.metadata = metadata;
		}

		return wrappedPage;
	}

	private createIntrinsicCustomElementRenderHook(target: ProcessedAsset[]) {
		return ({ tagName }: { tagName: string }) => {
			const currentImportedScriptFiles = this.getActiveImportedIntrinsicScriptFiles();
			const intrinsicScriptFile = this.intrinsicCustomElementScriptFiles.get(tagName);

			if (intrinsicScriptFile && currentImportedScriptFiles?.has(intrinsicScriptFile)) {
				return undefined;
			}

			const assets = this.intrinsicCustomElementAssets.get(tagName);

			if (assets) {
				target.push(...assets);
			}

			return undefined;
		};
	}
}
