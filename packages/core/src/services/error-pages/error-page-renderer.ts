import path from 'node:path';
import { fileSystem } from '@ecopages/file-system';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import type { ErrorPageLoaders, RouteRendererBody, ViewLoader } from '../../types/public-types.ts';
import { prepareExplicitStaticRender } from '../../route-renderer/explicit-view-render-preparation.ts';
import type { StaticGenerationRendererResolver } from '../../route-renderer/route-renderer.ts';
import { ERROR_PAGE_STATUS_BY_KIND, kindForStatus, type ErrorPageKind } from '../../errors/http-error-page-contract.ts';
import {
	buildDefaultErrorHtml,
	getDefaultServerErrorDetails,
	getPublicErrorMessage,
	type DefaultErrorPageDetails,
} from './default-error-pages.ts';

export type { ErrorPageKind };

export type ErrorPageRenderResult = {
	body: RouteRendererBody;
	sourceFile?: string;
};

export type ErrorPageRenderInput = {
	kind?: ErrorPageKind;
	status?: number;
	error?: unknown;
};

type ErrorPageLoader = ViewLoader;

type CustomErrorPageSource = { kind: 'filesystem'; templatePath: string } | { kind: 'loader'; loader: ErrorPageLoader };

const ERROR_PAGE_RENDER_ERRORS = {
	missingIntegration: (routePath: string) =>
		`View at ${routePath} is missing component identity integration. Ensure it's defined with eco.page() and exported as default.`,
	noRendererForIntegration: (integrationName: string) => `No renderer found for integration: ${integrationName}`,
} as const;

function resolveRenderTarget(input: ErrorPageRenderInput): { status: number; kind: ErrorPageKind | undefined } {
	const status = input.status ?? (input.kind ? ERROR_PAGE_STATUS_BY_KIND[input.kind] : 500);
	return {
		status,
		kind: input.kind ?? kindForStatus(status),
	};
}

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
		const { status, kind } = resolveRenderTarget(input);
		const source = kind ? this.resolveCustomSource(kind) : undefined;
		const props = this.getCustomPageProps(status, input.error);

		if (source?.kind === 'filesystem') {
			return await this.renderFileSystemPage(source.templatePath, props);
		}

		if (source?.kind === 'loader') {
			return await this.renderRegisteredPage(source.loader, status, props);
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
		const { status } = resolveRenderTarget(input);
		return {
			body: buildDefaultErrorHtml(status, this.getCustomPageProps(status, input.error)),
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

		const loader = this.loaders[kind];
		if (loader) {
			return { kind: 'loader', loader };
		}

		return undefined;
	}

	private async renderFileSystemPage(
		templatePath: string,
		props: DefaultErrorPageDetails & { status: number },
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
		status: number,
		props: DefaultErrorPageDetails & { status: number },
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

		const response = await renderer.renderToResponse(renderableView, { ...staticProps, ...props }, { status });

		return {
			body: await response.text(),
			sourceFile: this.resolveViewSourceFile(view.config?.identity?.file),
		};
	}

	private getTemplatePath(kind: ErrorPageKind): string {
		const status = ERROR_PAGE_STATUS_BY_KIND[kind];
		return (
			this.appConfig.absolutePaths.errorPageTemplatePaths?.[status] ||
			(kind === 'notFound' ? this.appConfig.absolutePaths.error404TemplatePath : '') ||
			(kind === 'serverError' ? this.appConfig.absolutePaths.error500TemplatePath : '') ||
			''
		);
	}

	private getCustomPageProps(status: number, error: unknown): DefaultErrorPageDetails & { status: number } {
		if (status >= 500) {
			return { status, ...getDefaultServerErrorDetails(error) };
		}
		const message = getPublicErrorMessage(error);
		return message ? { status, message } : { status };
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
export function logErrorPageFailure(kind: ErrorPageKind | undefined, error: unknown): void {
	const status = kind ? ERROR_PAGE_STATUS_BY_KIND[kind] : 500;
	appLogger.error(`Custom ${status} page failed`, error);
}
