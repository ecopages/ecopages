import type { IHmrManager } from '../../public-types';
import type { FSRouter } from '../../router/fs-router';
import type { ExplicitStaticRouteMatcher } from './explicit-static-route-matcher';
import type { FileSystemResponseMatcher } from './fs-server-response-matcher';
import { appLogger } from '../../global/app-logger';
import { HttpError } from '../../errors/http-error';

export interface ServerRouteHandlerParams {
	router: FSRouter;
	fileSystemResponseMatcher: FileSystemResponseMatcher;
	explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
	watch?: boolean;
	hmrManager?: IHmrManager;
}

/**
 * Handles HTTP requests and routing for the server.
 */
export class ServerRouteHandler {
	private readonly router: FSRouter;
	private readonly fileSystemResponseMatcher: FileSystemResponseMatcher;
	private readonly explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
	private readonly watch: boolean;
	private readonly hmrManager?: IHmrManager;

	constructor({
		router,
		fileSystemResponseMatcher,
		explicitStaticRouteMatcher,
		watch = false,
		hmrManager,
	}: ServerRouteHandlerParams) {
		this.router = router;
		this.fileSystemResponseMatcher = fileSystemResponseMatcher;
		this.explicitStaticRouteMatcher = explicitStaticRouteMatcher;
		this.watch = watch;
		this.hmrManager = hmrManager;
	}

	/**
	 * Inject HMR script in dev mode
	 */
	shouldInjectHmrScript(): boolean {
		return this.watch && this.hmrManager?.isEnabled() === true;
	}

	isHtmlResponse(response: Response): boolean {
		const contentType = response.headers.get('Content-Type');
		return contentType !== null && contentType.startsWith('text/html');
	}

	/**
	 * Handles HTTP requests from the router adapter.
	 */
	async handleResponse(request: Request): Promise<Response> {
		const pathname = new URL(request.url).pathname;

		const explicitMatch = !pathname.includes('.') && this.explicitStaticRouteMatcher?.match(request.url);

		if (explicitMatch) {
			const response = await this.explicitStaticRouteMatcher!.handleMatch(explicitMatch);
			return this.maybeInjectHmrScript(response);
		}

		const fsMatch = !pathname.includes('.') && this.router.match(request.url);

		const response = await (fsMatch
			? this.fileSystemResponseMatcher.handleMatch(fsMatch)
			: this.handleNoMatch(request));

		return this.maybeInjectHmrScript(response);
	}

	/**
	 * Inject HMR script if in dev mode and response is HTML.
	 */
	private async maybeInjectHmrScript(response: Response): Promise<Response> {
		if (this.shouldInjectHmrScript() && this.isHtmlResponse(response)) {
			const html = await response.text();

			const hmrScript = `<script type="module">import '/_hmr_runtime.js';</script>`;

			const updatedHtml = html.replace(/<\/html>/i, `${hmrScript}</html>`);

			const headers = new Headers(response.headers);
			headers.delete('Content-Length');

			return new Response(updatedHtml, {
				status: response.status,
				statusText: response.statusText,
				headers,
			});
		}

		return response;
	}

	/**
	 * Handles requests that do not match any routes.
	 */
	async handleNoMatch(request: Request): Promise<Response> {
		try {
			const pathname = new URL(request.url).pathname;
			return await this.fileSystemResponseMatcher.handleNoMatch(pathname);
		} catch (error) {
			if (error instanceof HttpError) {
				return error.toResponse();
			}
			if (error instanceof Error) {
				this.hmrManager?.broadcast({ type: 'error', message: error.message });
				appLogger.error('Error handling no match:', error);
			}
			return new Response('Internal Server Error', { status: 500 });
		}
	}
}
