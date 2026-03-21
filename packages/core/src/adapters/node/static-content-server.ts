import { createServer, type IncomingMessage, type Server as NodeHttpServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT, STATUS_MESSAGE } from '../../constants.ts';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';

type NodeStaticContentServerOptions = {
	hostname?: string;
	port?: number;
};

/**
 * Serves prebuilt static Ecopages output through Node's HTTP server.
 *
 * @remarks
 * This server is used by the Node preview/build path once the app has already
 * emitted its static output. It intentionally stays small: path sanitization,
 * content-type selection, optional gzip serving, and 404 handling.
 */
export class NodeStaticContentServer {
	private readonly appConfig: EcoPagesAppConfig;
	private readonly options: NodeStaticContentServerOptions;
	private server: NodeHttpServer | null = null;

	/**
	 * Creates the Node static-content server for one built app output directory.
	 */
	constructor({ appConfig, options }: { appConfig: EcoPagesAppConfig; options?: NodeStaticContentServerOptions }) {
		this.appConfig = appConfig;
		this.options = {
			hostname: options?.hostname ?? DEFAULT_ECOPAGES_HOSTNAME,
			port: options?.port ?? DEFAULT_ECOPAGES_PORT,
		};
	}

	/**
	 * Returns whether the given content type should be served from a pre-gzipped
	 * companion file when available.
	 */
	private shouldServeGzip(contentType: string): boolean {
		return ['text/javascript', 'text/css'].includes(contentType);
	}

	/**
	 * Normalizes a request pathname and rejects directory traversal attempts.
	 */
	private sanitizePath(pathname: string): string | null {
		const withoutLeadingSlash = pathname.replace(/^\/+/, '');
		const normalizedPath = normalize(withoutLeadingSlash);

		if (normalizedPath.startsWith('..') || normalizedPath.includes(`..${sep}`)) {
			return null;
		}

		return normalizedPath;
	}

	/**
	 * Writes one HTTP response with the provided headers and optional body.
	 */
	private sendResponse(res: ServerResponse, status: number, headers: Record<string, string>, body?: Buffer): void {
		res.statusCode = status;
		for (const [key, value] of Object.entries(headers)) {
			res.setHeader(key, value);
		}

		if (!body) {
			res.end();
			return;
		}

		res.end(body);
	}

	/**
	 * Serves the generated 404 page when present, or a plain-text fallback.
	 */
	private sendNotFoundPage(req: IncomingMessage, res: ServerResponse): void {
		const error404TemplatePath = join(this.appConfig.absolutePaths.distDir, '404.html');
		const isHead = (req.method ?? 'GET').toUpperCase() === 'HEAD';

		if (!fileSystem.exists(error404TemplatePath)) {
			this.sendResponse(
				res,
				404,
				{ 'Content-Type': 'text/plain' },
				isHead ? undefined : Buffer.from(STATUS_MESSAGE[404]),
			);
			return;
		}

		const file = fileSystem.readFileAsBuffer(error404TemplatePath);
		this.sendResponse(res, 404, { 'Content-Type': 'text/html' }, isHead ? undefined : file);
	}

	/**
	 * Serves one concrete file path, honoring gzip and HEAD semantics.
	 */
	private serveFile(req: IncomingMessage, res: ServerResponse, filePath: string, status = 200): void {
		const contentType = ServerUtils.getContentType(extname(filePath));
		const acceptsGzip = req.headers['accept-encoding']?.includes('gzip');
		const isHead = (req.method ?? 'GET').toUpperCase() === 'HEAD';

		if (acceptsGzip && this.shouldServeGzip(contentType)) {
			const gzipPath = `${filePath}.gz`;
			if (fileSystem.exists(gzipPath)) {
				const file = fileSystem.readFileAsBuffer(gzipPath);
				this.sendResponse(
					res,
					status,
					{
						'Content-Type': contentType,
						'Content-Encoding': 'gzip',
						Vary: 'Accept-Encoding',
					},
					isHead ? undefined : file,
				);
				return;
			}
		}

		if (!fileSystem.exists(filePath)) {
			this.sendNotFoundPage(req, res);
			return;
		}

		const file = fileSystem.readFileAsBuffer(filePath);
		this.sendResponse(res, status, { 'Content-Type': contentType }, isHead ? undefined : file);
	}

	/**
	 * Handles one incoming Node HTTP request against the built static output tree.
	 */
	private handleRequest(req: IncomingMessage, res: ServerResponse): void {
		const method = (req.method ?? 'GET').toUpperCase();
		const isHead = method === 'HEAD';
		if (method !== 'GET' && method !== 'HEAD') {
			this.sendResponse(
				res,
				405,
				{ Allow: 'GET, HEAD', 'Content-Type': 'text/plain' },
				isHead ? undefined : Buffer.from('Method Not Allowed'),
			);
			return;
		}

		const url = new URL(req.url ?? '/', 'http://localhost');
		let decodedPathname = '/';
		try {
			decodedPathname = decodeURIComponent(url.pathname);
		} catch {
			this.sendResponse(
				res,
				400,
				{ 'Content-Type': 'text/plain' },
				isHead ? undefined : Buffer.from('Invalid path'),
			);
			return;
		}

		const pathname = decodedPathname === '/' ? '/index.html' : decodedPathname;
		const relativePath = this.sanitizePath(pathname);

		if (!relativePath) {
			this.sendResponse(
				res,
				400,
				{ 'Content-Type': 'text/plain' },
				isHead ? undefined : Buffer.from('Invalid path'),
			);
			return;
		}

		const basePath = join(this.appConfig.absolutePaths.distDir, relativePath);

		if (pathname.includes('.')) {
			this.serveFile(req, res, basePath);
			return;
		}

		const htmlCandidates = [`${basePath}.html`, join(basePath, 'index.html')];

		for (const candidate of htmlCandidates) {
			if (fileSystem.exists(candidate)) {
				this.serveFile(req, res, candidate);
				return;
			}
		}

		this.sendNotFoundPage(req, res);
	}

	/**
	 * Starts the static preview server.
	 */
	public async start(): Promise<NodeHttpServer> {
		if (this.server) {
			return this.server;
		}

		this.server = createServer(this.handleRequest.bind(this));
		const hostname = this.options.hostname ?? DEFAULT_ECOPAGES_HOSTNAME;
		const port = this.options.port ?? DEFAULT_ECOPAGES_PORT;

		await new Promise<void>((resolve) => {
			this.server!.listen(port, hostname, () => resolve());
		});

		return this.server;
	}

	/**
	 * Stops the static preview server and optionally closes active connections.
	 */
	public async stop(force = true): Promise<void> {
		if (!this.server) {
			return;
		}

		const activeServer = this.server;
		this.server = null;

		await new Promise<void>((resolve, reject) => {
			activeServer.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});

			if (force) {
				activeServer.closeAllConnections();
			}
		});
	}
}
