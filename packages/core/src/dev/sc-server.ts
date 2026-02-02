import { extname, join } from 'node:path';
import { STATUS_MESSAGE } from '../constants.ts';
import { fileSystem } from '@ecopages/file-system';
import { ServerUtils } from '../utils/server-utils.module.ts';
import type { Server } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types.ts';

type StaticContentServerOptions = {
	port?: number;
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

	private isHtml(contentType: string) {
		return contentType === 'text/html';
	}

	private async sendNotFoundPage() {
		const error404TemplatePath = `${this.appConfig.absolutePaths.distDir}/404.html`;

		try {
			fileSystem.exists(error404TemplatePath);
		} catch {
			return new Response(STATUS_MESSAGE[404], {
				status: 404,
			});
		}

		const response = new Response(Bun.file(error404TemplatePath) as BodyInit, {
			headers: { 'Content-Type': 'text/html' },
		});

		return response;
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

		const response = this.serveFromDir({
			path: reqPath,
			request,
		});

		if (response) return response;

		return new Response(STATUS_MESSAGE[404], {
			status: 404,
		});
	}

	private startServer() {
		this.server = Bun.serve({
			fetch: this.fetch.bind(this),
			port: this.options.port,
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
