import type { Server as NodeHttpServer } from 'node:http';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import type { ApiHandler, ErrorHandler, StaticRoute } from '../../public-types.ts';
import { AbstractServerAdapter, type ServerAdapterResult } from '../abstract/server-adapter.ts';

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
}

export class NodeServerAdapter extends AbstractServerAdapter<NodeServerAdapterParams, NodeServerAdapterResult> {
	private initialized = false;

	constructor(options: NodeServerAdapterParams) {
		super(options);
	}

	public async initialize(): Promise<void> {
		this.initialized = true;
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
		};
	}

	public async handleRequest(_request: Request): Promise<Response> {
		if (!this.initialized) {
			throw new Error('Node server adapter is not initialized. Call createAdapter() first.');
		}

		return new Response('Node server adapter scaffold: request handling not implemented yet', {
			status: 501,
		});
	}

	public async completeInitialization(_server: NodeServerInstance): Promise<void> {
		appLogger.debug('Node server adapter scaffold initialization completed');
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
