import { appLogger } from '../../global/app-logger.ts';
import type { StaticRoute } from '../../types/public-types.ts';
import { SharedApplicationAdapter } from '../shared/application-adapter.ts';
import { resolveRuntimeBinding } from '../shared/runtime-app-bootstrap.ts';
import type { RuntimeHost } from '../shared/runtime-host.ts';
import type { EcopagesAppOptions } from '../create-app.ts';
import { type NodeServerAdapterResult, createNodeServerAdapter } from './server-adapter.ts';
import { NodeHttpRequestBridge } from './http-request-bridge.ts';
import type { NodeServerInstance } from './server-adapter.ts';
import { NodeRuntimeHost } from './runtime-host.ts';

export class NodeEcopagesApp extends SharedApplicationAdapter<EcopagesAppOptions, NodeServerInstance, Request> {
	serverAdapter: NodeServerAdapterResult | undefined;
	private server: NodeServerInstance | null = null;
	private runtimeOrigin = '';
	private readonly runtimeHost: RuntimeHost<NodeServerInstance, { port?: number; hostname?: string }>;

	constructor(
		options: EcopagesAppOptions,
		dependencies: {
			runtimeHost: RuntimeHost<NodeServerInstance, { port?: number; hostname?: string }>;
		},
	) {
		super(options);
		this.runtimeHost = dependencies.runtimeHost;
	}

	protected createServerAdapter(
		params: Parameters<typeof createNodeServerAdapter>[0],
	): Promise<NodeServerAdapterResult> {
		return createNodeServerAdapter(params);
	}

	public async stop(force = true): Promise<void> {
		if (!this.server) {
			return;
		}

		const activeServer = this.server;
		this.server = null;
		await this.runtimeHost.stop(activeServer, { force });
	}

	protected async initializeServerAdapter(): Promise<NodeServerAdapterResult> {
		const binding = resolveRuntimeBinding({
			cliArgs: this.cliArgs,
			serverOptions: this.serverOptions,
		});
		this.runtimeOrigin = binding.runtimeOrigin;

		return this.createServerAdapter({
			runtimeOrigin: this.runtimeOrigin,
			appConfig: this.appConfig,
			apiHandlers: this.apiHandlers,
			staticRoutes: this.staticRoutes as StaticRoute[],
			errorHandler: this.errorHandler,
			options: { watch: binding.watch },
			serveOptions: binding.serveOptions,
		});
	}

	public async start(): Promise<NodeServerInstance | void> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		if (this.server) {
			return this.server;
		}

		const { build, preview } = this.cliArgs;

		if (build || preview) {
			appLogger.debugTime('Building static pages');
			await this.serverAdapter.buildStatic({ preview });
			await this.stop(true);
			appLogger.debugTimeEnd('Building static pages');

			if (build) {
				process.exit(0);
			}
			return;
		}

		const serveOptions = this.serverAdapter.getServerOptions();
		this.server = await this.runtimeHost.start({
			serveOptions,
			handleRequest: async (request) => await this.serverAdapter!.handleRequest(request),
			onError: async () => {},
		});
		this.runtimeOrigin = this.runtimeHost.getOrigin(this.server, serveOptions);

		await this.serverAdapter.completeInitialization(this.server);
		appLogger.info(`Node server running at ${this.runtimeOrigin}`);

		return this.server;
	}

	public async fetch(request: Request): Promise<Response> {
		if (!this.serverAdapter) {
			this.serverAdapter = await this.initializeServerAdapter();
		}

		return this.serverAdapter.handleRequest(request);
	}
}

export async function createNodeApp(options: EcopagesAppOptions): Promise<NodeEcopagesApp> {
	return new NodeEcopagesApp(options, {
		runtimeHost: new NodeRuntimeHost(new NodeHttpRequestBridge()),
	});
}

export async function createApp(options: EcopagesAppOptions): Promise<NodeEcopagesApp> {
	return createNodeApp(options);
}
