import { createServer, type IncomingMessage, type Server as NodeHttpServer, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT, STATUS_MESSAGE } from '../../config/constants.ts';
import { fileSystem } from '@ecopages/file-system';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { ServerUtils } from '../../utils/server-utils.module.ts';
import { FileSystemServerResponseFactory } from '../shared/http/fs-server-response-factory.ts';

type NodeStaticContentServerOptions = {
	hostname?: string;
	port?: number;
};

function normalizeHeader(value: string | string[] | undefined): string | undefined {
	return Array.isArray(value) ? value.join(',') : value;
}

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
	private readonly fileResponseFactory = new FileSystemServerResponseFactory({ options: { watchMode: false } });
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

	/** Serves one concrete file using the shared response, cache, ETag, and gzip policy. */
	private async serveFile(req: IncomingMessage, res: ServerResponse, filePath: string): Promise<void> {
		const contentType = ServerUtils.getContentType(extname(filePath));
		const isHead = (req.method ?? 'GET').toUpperCase() === 'HEAD';
		const response = await this.fileResponseFactory.createFileResponse(filePath, contentType, {
			acceptEncoding: normalizeHeader(req.headers['accept-encoding']),
			ifNoneMatch: normalizeHeader(req.headers['if-none-match']),
		});
		if (!response) {
			this.sendNotFoundPage(req, res);
			return;
		}

		const headers = Object.fromEntries(response.headers.entries());
		const body = isHead || !response.body ? undefined : Buffer.from(await response.arrayBuffer());
		this.sendResponse(res, response.status, headers, body);
	}

	/**
	 * Handles one incoming Node HTTP request against the built static output tree.
	 */
	private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
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

		const filePath = ServerUtils.resolveStaticFilePath(join(this.appConfig.absolutePaths.distDir, relativePath));
		if (filePath) {
			await this.serveFile(req, res, filePath);
			return;
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

		this.server = createServer((req, res) => {
			void this.handleRequest(req, res).catch((error: unknown) => {
				if (res.headersSent) {
					res.destroy(error instanceof Error ? error : undefined);
					return;
				}
				this.sendResponse(res, 500, { 'Content-Type': 'text/plain' }, Buffer.from(STATUS_MESSAGE[500]));
			});
		});
		const hostname = this.options.hostname ?? DEFAULT_ECOPAGES_HOSTNAME;
		const port = this.options.port ?? DEFAULT_ECOPAGES_PORT;

		await new Promise<void>((resolve, reject) => {
			const activeServer = this.server!;
			activeServer.once('error', reject);
			activeServer.listen(port, hostname, () => {
				activeServer.off('error', reject);
				resolve();
			});
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

	async [Symbol.asyncDispose](): Promise<void> {
		await this.stop();
	}
}
