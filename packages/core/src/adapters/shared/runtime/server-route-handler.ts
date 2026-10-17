import type { RouteRegistry } from '../../../router/server/route-registry.ts';
import type { ExplicitStaticRouteMatcher } from '../http/explicit-static-route-matcher.ts';
import type { FileSystemResponseMatcher } from '../http/fs-server-response-matcher.ts';
import { appLogger } from '../../../global/app-logger.ts';
import { HttpError } from '../../../errors/http-error.ts';
import { ServerUtils } from '../../../utils/server-utils.module.ts';
import { parseSegmentPath, type ParsedSegmentPath } from '../../../router/server/segment-path-matcher.ts';

/**
 * Configuration parameters for ServerRouteHandler.
 */
export interface ServerRouteHandlerParams {
	/** File system router for matching request URLs to route handlers. */
	router: RouteRegistry;
	/** Matcher for handling file system route responses. */
	fileSystemResponseMatcher: FileSystemResponseMatcher;
	/** Optional matcher for explicit static routes like processed images or sitemaps. */
	explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;
}

/**
 * Handles HTTP requests and routing for the server.
 *
 * This class manages the request routing flow with a priority-based approach:
 * 1. Explicit static routes (highest priority - intentional mappings like /sitemap.xml)
 * 2. File-based routes without extensions (application routes)
 * 3. Static file fallback (lowest priority - disk serving)
 *
 */
export class ServerRouteHandler {
	private readonly router: RouteRegistry;
	private readonly fileSystemResponseMatcher: FileSystemResponseMatcher;
	private readonly explicitStaticRouteMatcher?: ExplicitStaticRouteMatcher;

	/**
	 * Creates a new ServerRouteHandler instance.
	 *
	 * @param params - Configuration parameters
	 */
	constructor({ router, fileSystemResponseMatcher, explicitStaticRouteMatcher }: ServerRouteHandlerParams) {
		this.router = router;
		this.fileSystemResponseMatcher = fileSystemResponseMatcher;
		this.explicitStaticRouteMatcher = explicitStaticRouteMatcher;
	}

	/**
	 * Handles HTTP requests from the router adapter.
	 *
	 * Priority-based routing flow:
	 * 1. Check explicit static routes first (e.g., /sitemap.xml, /image.webp from plugins)
	 * 2. Match file-based routes, unless the path ends in a known static file extension, so a
	 *    dotted route such as `/v1.2` still matches its Page
	 * 3. Fall back to static file serving from disk
	 *
	 * @param request - The incoming HTTP request
	 * @returns HTTP response for the matched route
	 */
	async handleResponse(request: Request, parsedPathSegments?: ParsedSegmentPath): Promise<Response> {
		const pathname = new URL(request.url).pathname;

		try {
			const pathSegments = parsedPathSegments ?? parseSegmentPath(pathname);
			const explicitMatch = this.explicitStaticRouteMatcher?.match(request.url, pathSegments);

			if (explicitMatch) {
				try {
					return await this.explicitStaticRouteMatcher!.handleMatch(explicitMatch);
				} catch (error) {
					if (error instanceof Response) {
						return error;
					}
					return await this.fileSystemResponseMatcher.renderServerError(pathname, error);
				}
			}

			const fsMatch =
				!ServerUtils.hasKnownStaticExtension(pathname) && this.router.matchRequest(request.url, pathSegments);

			return await (fsMatch
				? this.fileSystemResponseMatcher.handleMatch(fsMatch, request)
				: this.handleNoMatch(request));
		} catch (error) {
			if (error instanceof HttpError) {
				return error.toResponse();
			}
			throw error;
		}
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
		const pathname = new URL(request.url).pathname;
		try {
			return await this.fileSystemResponseMatcher.handleNoMatch(pathname, request);
		} catch (error) {
			if (error instanceof HttpError) {
				return error.toResponse();
			}
			if (error instanceof Error) {
				this.router.appConfig?.appRuntime?.hmr?.broadcast({ type: 'error', message: error.message });
				appLogger.error('Error handling no match:', error);
			}
			return await this.fileSystemResponseMatcher.renderServerError(pathname, error);
		}
	}
}
