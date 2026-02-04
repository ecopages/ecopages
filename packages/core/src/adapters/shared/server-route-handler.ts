import type { IHmrManager } from '../../public-types';
import type { FSRouter } from '../../router/fs-router';
import type { ExplicitStaticRouteMatcher } from './explicit-static-route-matcher';
import type { FileSystemResponseMatcher } from './fs-server-response-matcher';
import { appLogger } from '../../global/app-logger';
import { HttpError } from '../../errors/http-error';

/**
 * Configuration parameters for ServerRouteHandler.
 */
export interface ServerRouteHandlerParams {
	/** File system router for matching request URLs to route handlers. */
	router: FSRouter;
	/** Matcher for handling file system route responses. */
	fileSystemResponseMatcher: FileSystemResponseMatcher;
	/** Optional matcher for explicit static routes like processed images or sitemaps. */
	explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
	/** Enable watch mode for development. */
	watch?: boolean;
	/** HMR manager for broadcasting hot module reload events in development. */
	hmrManager?: IHmrManager;
}

/**
 * Handles HTTP requests and routing for the server.
 *
 * This class manages the request routing flow with a priority-based approach:
 * 1. Explicit static routes (highest priority - intentional mappings like /sitemap.xml)
 * 2. File-based routes without extensions (application routes)
 * 3. Static file fallback (lowest priority - disk serving)
 *
 * In development mode, it also injects HMR scripts into HTML responses.
 */
export class ServerRouteHandler {
	private readonly router: FSRouter;
	private readonly fileSystemResponseMatcher: FileSystemResponseMatcher;
	private readonly explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
	private readonly watch: boolean;
	private readonly hmrManager?: IHmrManager;

	/**
	 * Creates a new ServerRouteHandler instance.
	 *
	 * @param params - Configuration parameters
	 */
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
	 * Determines if HMR script should be injected.
	 *
	 * @returns true if in watch mode and HMR manager is enabled
	 */
	shouldInjectHmrScript(): boolean {
		return this.watch && this.hmrManager?.isEnabled() === true;
	}

	/**
	 * Checks if a response contains HTML content.
	 *
	 * @param response - The HTTP response to check
	 * @returns true if Content-Type header starts with 'text/html'
	 */
	isHtmlResponse(response: Response): boolean {
		const contentType = response.headers.get('Content-Type');
		return contentType !== null && contentType.startsWith('text/html');
	}

	/**
	 * Handles HTTP requests from the router adapter.
	 *
	 * Priority-based routing flow:
	 * 1. Check explicit static routes first (e.g., /sitemap.xml, /image.webp from plugins)
	 * 2. Match file-based routes without extensions (application routes)
	 * 3. Fall back to static file serving from disk
	 *
	 * @param request - The incoming HTTP request
	 * @returns HTTP response, potentially with injected HMR script in dev mode
	 */
	async handleResponse(request: Request): Promise<Response> {
		const pathname = new URL(request.url).pathname;

		const explicitMatch = this.explicitStaticRouteMatcher?.match(request.url);

		if (explicitMatch) {
			const response = await this.explicitStaticRouteMatcher!.handleMatch(explicitMatch);
			return this.maybeInjectHmrScript(response);
		}

		const fsMatch = !pathname.includes('.') && this.router.match(request.url);

		const response = await (fsMatch
			? this.fileSystemResponseMatcher.handleMatch(fsMatch, request)
			: this.handleNoMatch(request));

		return this.maybeInjectHmrScript(response);
	}

	/**
	 * Injects HMR script into HTML responses in development mode.
	 *
	 * The script is inserted before the closing </html> tag to enable
	 * hot module reloading without full page refreshes.
	 *
	 * @param response - The HTTP response to potentially modify
	 * @returns Original response or modified response with HMR script
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
	 *
	 * This is the final fallback that attempts to serve static files from disk.
	 * If the requested path corresponds to an HTML file or no file is found,
	 * a custom 404 response is returned.
	 *
	 * @param request - The HTTP request to handle
	 * @returns Response from file system or error response
	 * @throws HttpError for standard HTTP errors
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
