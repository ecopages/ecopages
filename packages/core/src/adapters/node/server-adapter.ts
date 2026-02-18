import type { Server as NodeHttpServer } from 'node:http';
import path from 'node:path';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler, ErrorHandler, StaticRoute } from '../../public-types.ts';
import { RouteRendererFactory } from '../../route-renderer/route-renderer.ts';
import { FSRouter } from '../../router/fs-router.ts';
import { FSRouterScanner } from '../../router/fs-router-scanner.ts';
import { MemoryCacheStore } from '../../services/cache/memory-cache-store.ts';
import { PageCacheService } from '../../services/cache/page-cache-service.ts';
import { AbstractServerAdapter, type ServerAdapterResult } from '../abstract/server-adapter.ts';
import { ExplicitStaticRouteMatcher } from '../shared/explicit-static-route-matcher.ts';
import { FileSystemServerResponseFactory } from '../shared/fs-server-response-factory.ts';
import { FileSystemResponseMatcher } from '../shared/fs-server-response-matcher.ts';
import { ServerRouteHandler } from '../shared/server-route-handler.ts';

export type NodeServerInstance = NodeHttpServer;

export type NodeServeAdapterServerOptions = {
	port?: number;
	hostname?: string;
	[key: string]: unknown;
};

export interface NodeServerAdapterParams {
	appConfig: EcoPagesAppConfig;
	runtimeOrigin: string;
	serveOptions: NodeServeAdapterServerOptions;
	apiHandlers?: ApiHandler[];
	staticRoutes?: StaticRoute[];
	errorHandler?: ErrorHandler;
	options?: {
		watch?: boolean;
	};
}

export interface NodeServerAdapterResult extends ServerAdapterResult {
	completeInitialization: (server: NodeServerInstance) => Promise<void>;
	handleRequest: (request: Request) => Promise<Response>;
}

export class NodeServerAdapter extends AbstractServerAdapter<NodeServerAdapterParams, NodeServerAdapterResult> {
	private initialized = false;
	private apiHandlers: ApiHandler[];
	private staticRoutes: StaticRoute[];
	private errorHandler?: ErrorHandler;
	private router!: FSRouter;
	private fileSystemResponseMatcher!: FileSystemResponseMatcher;
	private routeRendererFactory!: RouteRendererFactory;
	private routeHandler!: ServerRouteHandler;

	constructor(options: NodeServerAdapterParams) {
		super(options);
		this.apiHandlers = options.apiHandlers || [];
		this.staticRoutes = options.staticRoutes || [];
		this.errorHandler = options.errorHandler;
	}

	public async initialize(): Promise<void> {
		await this.initRouter();
		this.configureResponseHandlers();
		this.initialized = true;
	}

	private async initRouter(): Promise<void> {
		const scanner = new FSRouterScanner({
			dir: path.join(this.appConfig.rootDir, this.appConfig.srcDir, this.appConfig.pagesDir),
			appConfig: this.appConfig,
			origin: this.runtimeOrigin,
			templatesExt: this.appConfig.templatesExt,
			options: {
				buildMode: !this.options?.watch,
			},
		});

		this.router = new FSRouter({
			origin: this.runtimeOrigin,
			assetPrefix: path.join(this.appConfig.rootDir, this.appConfig.distDir),
			scanner,
		});

		await this.router.init();
	}

	private configureResponseHandlers(): void {
		this.routeRendererFactory = new RouteRendererFactory({
			appConfig: this.appConfig,
			runtimeOrigin: this.runtimeOrigin,
		});

		const fileSystemResponseFactory = new FileSystemServerResponseFactory({
			appConfig: this.appConfig,
			routeRendererFactory: this.routeRendererFactory,
			options: {
				watchMode: false,
			},
		});

		const cacheConfig = this.appConfig.cache;
		const isCacheEnabled = cacheConfig?.enabled ?? true;
		let cacheService: PageCacheService | null = null;

		if (isCacheEnabled) {
			const store =
				cacheConfig?.store === 'memory' || !cacheConfig?.store
					? new MemoryCacheStore({ maxEntries: cacheConfig?.maxEntries })
					: cacheConfig.store;
			cacheService = new PageCacheService({ store, enabled: true });
		}

		this.fileSystemResponseMatcher = new FileSystemResponseMatcher({
			router: this.router,
			routeRendererFactory: this.routeRendererFactory,
			fileSystemResponseFactory,
			cacheService,
			defaultCacheStrategy: cacheConfig?.defaultStrategy ?? 'static',
		});

		const explicitStaticRouteMatcher =
			this.staticRoutes.length > 0
				? new ExplicitStaticRouteMatcher({
						appConfig: this.appConfig,
						routeRendererFactory: this.routeRendererFactory,
						staticRoutes: this.staticRoutes,
					})
				: undefined;

		this.routeHandler = new ServerRouteHandler({
			router: this.router,
			fileSystemResponseMatcher: this.fileSystemResponseMatcher,
			explicitStaticRouteMatcher,
			watch: false,
		});
	}

	public getServerOptions(): NodeServeAdapterServerOptions {
		return {
			...this.serveOptions,
		};
	}

	public async buildStatic(): Promise<void> {
		throw new Error('NodeServerAdapter.buildStatic is not implemented yet');
	}

	public async createAdapter(): Promise<NodeServerAdapterResult> {
		await this.initialize();

		return {
			getServerOptions: this.getServerOptions.bind(this),
			buildStatic: this.buildStatic.bind(this),
			completeInitialization: this.completeInitialization.bind(this),
			handleRequest: this.handleRequest.bind(this),
		};
	}

	public async handleRequest(_request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		return this.routeHandler.handleResponse(_request);
	}

	public async completeInitialization(_server: NodeServerInstance): Promise<void> {
		appLogger.debug('Node server adapter initialization completed', {
			apiHandlers: this.apiHandlers.length,
			staticRoutes: this.staticRoutes.length,
			hasErrorHandler: !!this.errorHandler,
		});
	}
}

export async function createNodeServerAdapter(params: NodeServerAdapterParams): Promise<NodeServerAdapterResult> {
	const runtimeOrigin =
		params.runtimeOrigin ??
		`http://${params.serveOptions.hostname || 'localhost'}:${params.serveOptions.port || 3000}`;

	const adapter = new NodeServerAdapter({
		...params,
		runtimeOrigin,
	});

	return adapter.createAdapter();
}
