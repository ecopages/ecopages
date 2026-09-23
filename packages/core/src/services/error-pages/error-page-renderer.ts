import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { ErrorPageLoaders, RouteRendererBody, ViewLoader } from '../../types/public-types.ts';
import { prepareExplicitStaticRender } from '../../route-renderer/explicit-view-render-preparation.ts';
import type { StaticGenerationRendererResolver } from '../../route-renderer/route-renderer.ts';
import {
	buildDefaultNotFoundHtml,
	buildDefaultServerErrorHtml,
	getDefaultServerErrorDetails,
	type DefaultServerErrorDetails,
} from './default-error-pages.ts';

export type ErrorPageKind = 'notFound' | 'serverError';

export type ErrorPageRenderResult = {
	body: RouteRendererBody;
	sourceFile?: string;
};

export type ErrorPageRenderInput = { kind: 'notFound' } | { kind: 'serverError'; error?: unknown };

type ErrorPageLoader = ViewLoader;

type CustomErrorPageSource = { kind: 'filesystem'; templatePath: string } | { kind: 'loader'; loader: ErrorPageLoader };

const ERROR_PAGE_RENDER_ERRORS = {
	missingIntegration: (routePath: string) =>
		`View at ${routePath} is missing component identity integration. Ensure it's defined with eco.page() and exported as default.`,
	noRendererForIntegration: (integrationName: string) => `No renderer found for integration: ${integrationName}`,
} as const;

/**
 * Owns error-page source precedence and rendering for runtime and static paths.
 *
 * @remarks
 * Filesystem semantic pages win over explicitly registered views. A missing
 * custom source is the only case that uses a framework default; rendering
 * failures are intentionally propagated so callers can apply their own retry
 * or fallback policy without hiding the original failure.
 */
export class ErrorPageRenderer {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly routeRendererFactory?: StaticGenerationRendererResolver;
	private readonly loaders: ErrorPageLoaders;

	constructor({
		appConfig,
		routeRendererFactory,
		errorPageLoaders = {},
	}: {
		appConfig: EcoPagesAppConfig;
		routeRendererFactory?: StaticGenerationRendererResolver;
		errorPageLoaders?: ErrorPageLoaders;
	}) {
		this.appConfig = appConfig;
		this.routeRendererFactory = routeRendererFactory;
		this.loaders = errorPageLoaders;
	}

	async render(input: ErrorPageRenderInput): Promise<ErrorPageRenderResult> {
		const source = this.resolveCustomSource(input.kind);
		const props = this.getCustomPageProps(input);

		if (source?.kind === 'filesystem') {
			return await this.renderFileSystemPage(source.templatePath, props);
		}

		if (source?.kind === 'loader') {
			return await this.renderRegisteredPage(source.loader, input.kind === 'notFound' ? 404 : 500, props);
		}

		return this.renderBuiltIn(input);
	}

	/**
	 * Renders the framework-owned document, ignoring custom filesystem pages and
	 * registered views.
	 *
	 * @remarks
	 * Request-time callers use this after a custom 500 page itself fails so the
	 * fallback cannot re-enter the custom source.
	 */
	renderBuiltIn(input: ErrorPageRenderInput): ErrorPageRenderResult {
		return {
			body:
				input.kind === 'notFound'
					? buildDefaultNotFoundHtml()
					: buildDefaultServerErrorHtml(getDefaultServerErrorDetails(input.error)),
		};
	}

	/**
	 * Returns the source file used for incremental static-export reuse, without
	 * rendering the page.
	 */
	async resolveSourceFile(kind: ErrorPageKind): Promise<string | undefined> {
		const source = this.resolveCustomSource(kind);
		if (source?.kind === 'filesystem') {
			return source.templatePath;
		}
		if (source?.kind === 'loader') {
			const view = (await source.loader()).default;
			return this.resolveViewSourceFile(view.config?.identity?.file);
		}
		return undefined;
	}

	private resolveCustomSource(kind: ErrorPageKind): CustomErrorPageSource | undefined {
		const templatePath = this.getTemplatePath(kind);
		if (templatePath && fileSystem.exists(templatePath)) {
			return { kind: 'filesystem', templatePath };
		}

		const loader = kind === 'notFound' ? this.loaders.notFound : this.loaders.serverError;
		if (loader) {
			return { kind: 'loader', loader };
		}

		return undefined;
	}

	private async renderFileSystemPage(
		templatePath: string,
		props: DefaultServerErrorDetails | undefined,
	): Promise<ErrorPageRenderResult> {
		if (!this.routeRendererFactory) {
			throw new Error(`No route renderer available for ${templatePath}`);
		}
		const result = await this.routeRendererFactory.getPageRenderer(templatePath).execute({
			file: templatePath,
			props,
			locals: {},
		});
		return { body: result.body, sourceFile: templatePath };
	}

	private async renderRegisteredPage(
		loader: ErrorPageLoader,
		status: 404 | 500,
		props: DefaultServerErrorDetails | undefined,
	): Promise<ErrorPageRenderResult> {
		if (!this.routeRendererFactory) {
			throw new Error(`No route renderer available for __error__/${status}`);
		}
		const view = (await loader()).default;
		const {
			renderer,
			props: staticProps,
			view: renderableView,
		} = await prepareExplicitStaticRender({
			routePath: `__error__/${status}`,
			view,
			params: {},
			appConfig: this.appConfig,
			runtimeOrigin: this.appConfig.baseUrl,
			routeRendererFactory: this.routeRendererFactory,
			errors: ERROR_PAGE_RENDER_ERRORS,
		});

		const response = await renderer.renderToResponse(
			renderableView,
			{ ...staticProps, ...(props ?? {}) },
			{ status },
		);

		return {
			body: await response.text(),
			sourceFile: this.resolveViewSourceFile(view.config?.identity?.file),
		};
	}

	private getTemplatePath(kind: ErrorPageKind): string {
		return kind === 'notFound'
			? this.appConfig.absolutePaths.error404TemplatePath
			: this.appConfig.absolutePaths.error500TemplatePath;
	}

	private getCustomPageProps(input: ErrorPageRenderInput): DefaultServerErrorDetails | undefined {
		return input.kind === 'serverError' ? getDefaultServerErrorDetails(input.error) : undefined;
	}

	private resolveViewSourceFile(sourceFile: string | undefined): string | undefined {
		if (!sourceFile) {
			return undefined;
		}
		return path.isAbsolute(sourceFile) ? sourceFile : path.join(this.appConfig.rootDir, sourceFile);
	}
}

/**
 * Logs a custom error-page failure without replacing the original request error.
 */
export function logErrorPageFailure(kind: ErrorPageKind, error: unknown): void {
	appLogger.error(`Custom ${kind === 'notFound' ? '404' : '500'} page failed`, error);
}
