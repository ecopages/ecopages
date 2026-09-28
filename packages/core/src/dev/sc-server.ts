import { extname, join } from 'node:path';
import { STATUS_MESSAGE } from '../config/constants.ts';
import { fileSystem } from '@ecopages/file-system';
import { ServerUtils } from '../utils/server-utils.module.ts';
import type { Server } from 'bun';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { getRequiredBunRuntime } from '../utils/runtime.ts';

type StaticContentServerOptions = {
	port?: number;
	hostname?: string;
};

/**
 * Static content server for production builds.
 * Serves pre-built static files from the dist directory with gzip compression support.
 */
export class StaticContentServer {
	server: Server<unknown> | null = null;
	private appConfig: EcoPagesAppConfig;
	private options: StaticContentServerOptions = { port: 3000 };

	constructor({ appConfig, options }: { appConfig: EcoPagesAppConfig; options?: StaticContentServerOptions }) {
		this.appConfig = appConfig;
		if (options) this.options = options;
		this.startServer();
	}

	private shouldServeGzip(contentType: ReturnType<typeof ServerUtils.getContentType>) {
		return ['text/javascript', 'text/css'].includes(contentType);
	}

	/**
	 * Serves the generated 404 page when present, or a plain-text fallback.
	 */
	private sendNotFoundPage(): Response {
		const error404TemplatePath = join(this.appConfig.absolutePaths.distDir, '404.html');

		if (!fileSystem.exists(error404TemplatePath)) {
			return new Response(STATUS_MESSAGE[404], { status: 404 });
		}

		return new Response(fileSystem.readFileAsBuffer(error404TemplatePath) as BodyInit, {
			status: 404,
			headers: { 'Content-Type': 'text/html' },
		});
	}

	private async serveFromDir({ path, request }: { path: string; request: Request }): Promise<Response> {
		const { absolutePaths } = this.appConfig;
		const basePath = join(absolutePaths.distDir, path);
		const contentType = ServerUtils.getContentType(extname(basePath));
		const acceptsGzip = request.headers.get('Accept-Encoding')?.includes('gzip');

		try {
			if (acceptsGzip && this.shouldServeGzip(contentType)) {
				const gzipPath = `${basePath}.gz`;
				if (fileSystem.exists(gzipPath)) {
					const file = fileSystem.readFileAsBuffer(gzipPath) as BodyInit;
					return new Response(file, {
						headers: {
							'Content-Type': contentType,
							'Content-Encoding': 'gzip',
							Vary: 'Accept-Encoding',
						},
					});
				}
			}

			if (path.includes('.') && fileSystem.exists(basePath)) {
				const file = fileSystem.readFileAsBuffer(basePath) as BodyInit;
				return new Response(file, {
					headers: { 'Content-Type': contentType },
				});
			}

			const htmlCandidates = [`${basePath}.html`, `${basePath}/index.html`];

			for (const candidate of htmlCandidates) {
				if (fileSystem.exists(candidate)) {
					const file = fileSystem.readFileAsBuffer(candidate) as BodyInit;
					return new Response(file, {
						headers: {
							'Content-Type': ServerUtils.getContentType(extname(candidate)),
						},
					});
				}
			}

			return this.sendNotFoundPage();
		} catch {
			return this.sendNotFoundPage();
		}
	}

	async fetch(request: Request) {
		let reqPath = new URL(request.url).pathname;

		if (reqPath === '/') reqPath = '/index.html';

		return this.serveFromDir({
			path: reqPath,
			request,
		});
	}

	private startServer() {
		this.server = getRequiredBunRuntime().serve({
			fetch: this.fetch.bind(this),
			port: this.options.port,
			hostname: this.options.hostname,
		});
	}

	stop() {
		if (this.server) {
			this.server.stop(true);
		}
	}

	static createServer({
		appConfig,
		options,
	}: {
		appConfig: EcoPagesAppConfig;
		options?: StaticContentServerOptions;
	}) {
		return new StaticContentServer({
			appConfig: appConfig,
			options,
		});
	}
}
