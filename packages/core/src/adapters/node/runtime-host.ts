import { createServer, type Server as NodeServerInstance } from 'node:http';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime-app-bootstrap.ts';
import type { RuntimeHost, RuntimeHostStartOptions } from '../shared/runtime-host.ts';
import { isNodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';

type NodeServerFactory = typeof createServer;

/**
 * Node runtime host that binds the shared Web-request pipeline onto a concrete
 * Node HTTP server.
 *
 * @remarks
 * The host owns only transport concerns: creating the Node listener, converting
 * requests through `NodeHttpRequestBridge`, and handling socket-level failures.
 * Routing and rendering remain in the shared server adapter.
 */
export class NodeRuntimeHost implements RuntimeHost<NodeServerInstance, { port?: number; hostname?: string }> {
	/**
	 * Creates a Node runtime host with injectable request bridging and server
	 * creation seams for tests and alternate hosts.
	 */
	constructor(
		private readonly requestBridge: NodeHttpRequestBridge,
		private readonly serverFactory: NodeServerFactory = createServer,
	) {}

	/**
	 * Starts the Node HTTP server and wires each request through the shared Web
	 * request pipeline.
	 *
	 * @remarks
	 * Client disconnects are treated as normal aborts and do not trigger adapter
	 * error logging or the runtime host's `onError` callback.
	 */
	public async start(
		options: RuntimeHostStartOptions<{ port?: number; hostname?: string }>,
	): Promise<NodeServerInstance> {
		const hostname = String(options.serveOptions.hostname ?? DEFAULT_ECOPAGES_HOSTNAME);
		const port = Number(options.serveOptions.port ?? DEFAULT_ECOPAGES_PORT);
		const runtimeOrigin = resolveServeRuntimeOrigin({ hostname, port });

		const server = this.serverFactory(async (req, res) => {
			try {
				const webRequest = this.requestBridge.createWebRequest(req, runtimeOrigin);
				const response = await options.handleRequest(webRequest);
				await this.requestBridge.sendNodeResponse(res, response);
			} catch (error) {
				if (isNodeClientAbortError(error)) {
					return;
				}

				appLogger.error('Node server adapter request failed', error as Error);
				res.statusCode = 500;
				res.end('Internal Server Error');
				await options.onError(error instanceof Error ? error : new Error(String(error)));
			}
		});

		await new Promise<void>((resolve) => {
			server.listen(port, hostname, () => resolve());
		});

		return server;
	}

	/**
	 * Stops the Node HTTP server and, by default, force-closes any remaining open
	 * connections.
	 */
	public async stop(server: NodeServerInstance, options?: { force?: boolean }): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve();
			});

			if (options?.force ?? true) {
				server.closeAllConnections();
			}
		});
	}

	/**
	 * Resolves the public runtime origin from the bound Node listener.
	 *
	 * @remarks
	 * The host preserves the configured hostname rather than echoing the raw socket
	 * address because users care about the requested host contract, not the local
	 * bind interface that Node chose internally.
	 */
	public getOrigin(server: NodeServerInstance, fallbackServeOptions: { port?: number; hostname?: string }): string {
		const address = server.address();
		const fallbackHostname = fallbackServeOptions.hostname ?? DEFAULT_ECOPAGES_HOSTNAME;

		if (address && typeof address === 'object') {
			return resolveServeRuntimeOrigin({
				hostname: fallbackHostname,
				port: address.port,
			});
		}

		return resolveServeRuntimeOrigin({
			hostname: fallbackHostname,
			port: fallbackServeOptions.port,
		});
	}
}
