/**
 * This module contains the Kita.js renderer
 * @module
 */

import type {
	ComponentRenderInput,
	ComponentRenderResult,
	EcoComponent,
	EcoPagesElement,
	IntegrationRendererRenderOptions,
	RouteRendererBody,
} from '@ecopages/core';
import { IntegrationRenderer, type RenderToResponseContext } from '@ecopages/core/route-renderer/integration-renderer';
import { PLUGIN_NAME } from './kitajs.plugin.ts';

/** Narrows an EcoComponent to its KitaJS callable signature. */
type KitaViewFn<P> = (props: P) => Promise<EcoPagesElement> | EcoPagesElement;

/** KitaJS layout function signature. */
type KitaLayoutFn = (props: { children: EcoPagesElement } & Record<string, unknown>) => Promise<EcoPagesElement>;

/**
 * A renderer for the Kita.js integration.
 * It renders a page using the HtmlTemplate and Page components.
 */
export class KitaRenderer extends IntegrationRenderer<EcoPagesElement> {
	name = PLUGIN_NAME;

	/**
	 * Renders a Kita component boundary for component-level orchestration.
	 *
	 * Includes component-scoped dependency assets when declared.
	 */
	override async renderComponent(input: ComponentRenderInput): Promise<ComponentRenderResult> {
		const component = input.component as KitaViewFn<Record<string, unknown>>;
		const props = input.children === undefined ? input.props : { ...input.props, children: input.children };
		const content = await component(props);
		const html = String(content);
		const hasDependencies = Boolean(input.component.config?.dependencies);
		const canResolveAssets = typeof this.assetProcessingService?.processDependencies === 'function';
		const assets =
			hasDependencies && canResolveAssets
				? await this.processComponentDependencies([input.component])
				: undefined;

		return {
			html,
			canAttachAttributes: true,
			rootTag: this.getRootTagName(html),
			integrationName: this.name,
			assets,
		};
	}

	async render({
		params,
		query,
		props,
		locals,
		pageLocals,
		metadata,
		Page,
		Layout,
		HtmlTemplate,
	}: IntegrationRendererRenderOptions): Promise<RouteRendererBody> {
		try {
			const pageContent = await Page({ params, query, ...props, locals: pageLocals });
			const children =
				Layout && typeof Layout === 'function' ? await Layout({ children: pageContent, locals }) : pageContent;
			const body = await HtmlTemplate({
				metadata,
				pageProps: props ?? {},
				children,
			});

			return this.DOC_TYPE + body;
		} catch (error) {
			throw this.createRenderError('Error rendering page', error);
		}
	}

	async renderToResponse<P = Record<string, unknown>>(
		view: EcoComponent<P>,
		props: P,
		ctx: RenderToResponseContext,
	): Promise<Response> {
		try {
			const Layout = view.config?.layout as KitaLayoutFn | undefined;
			const HtmlTemplate = ctx.partial ? undefined : await this.getHtmlTemplate();
			const metadata =
				ctx.partial || !HtmlTemplate
					? undefined
					: view.metadata
						? await view.metadata({
								params: {},
								query: {},
								props: props as Record<string, unknown>,
								appConfig: this.appConfig,
							})
						: this.appConfig.defaultMetadata;

			if (!ctx.partial) {
				await this.prepareViewDependencies(view, Layout as EcoComponent | undefined);
			}

			const viewFn = view as KitaViewFn<P>;
			const renderExecution = await this.captureHtmlRender(async () => {
				const pageContent = await viewFn(props);

				if (ctx.partial) {
					return pageContent;
				}

				const children = Layout ? await Layout({ children: pageContent }) : pageContent;
				return (
					this.DOC_TYPE +
					(await HtmlTemplate!({
						metadata: metadata ?? this.appConfig.defaultMetadata,
						pageProps: (props as Record<string, unknown>) ?? {},
						children: children ?? '',
					}))
				);
			});

			const componentsToResolve = ctx.partial
				? [view]
				: ([HtmlTemplate, Layout, view].filter(Boolean) as EcoComponent[]);
			const body = await this.finalizeCapturedHtmlRender({
				html: renderExecution.html,
				componentsToResolve,
				graphContext: renderExecution.graphContext,
				partial: ctx.partial,
			});

			return this.createHtmlResponse(body, ctx);
		} catch (error) {
			throw this.createRenderError('Error rendering view', error);
		}
	}
}
