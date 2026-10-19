import { lookup } from 'node:dns/promises';
import { createServer, type Server as NodeServerInstance } from 'node:http';
import type { Socket } from 'node:net';
import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../constants.ts';
import { appLogger } from '../../global/app-logger.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime/runtime-app-bootstrap.ts';
import { isNodeClientAbortError, NodeHttpRequestBridge } from './http-request-bridge.ts';

type NodeServerFactory = typeof createServer;

export type NodeRuntimeServeOptions = {
	port?: number;
	hostname?: string;
	handleRequest(request: Request): Promise<Response>;
};

/**
 * The transport surface `EcopagesApp` and `NodeServerAdapter` use.
 *
 * @remarks
 * Tests pass a fake with this shape to run the app lifecycle without binding a port.
 */
export type RuntimeHost = Pick<NodeRuntimeHost, 'start' | 'stop' | 'getOrigin'>;

/**
 * Node runtime host that binds the shared Web-request pipeline onto a concrete
 * Node HTTP server.
 *
 * @remarks
 * The host owns only transport concerns: creating the Node listener, converting
 * requests through `NodeHttpRequestBridge`, and handling socket-level failures.
 * Routing and rendering remain in the shared server adapter.
 */
export class NodeRuntimeHost {
	/**
	 * Every open socket per started server, including upgraded WebSocket sockets.
	 *
	 * @remarks
	 * `closeAllConnections()` stops tracking a socket once it is upgraded, yet
	 * `server.close()` still waits for it, so a forced stop destroys these too.
	 */
	private readonly sockets = new WeakMap<NodeServerInstance, Set<Socket>>();

	/**
	 * Creates a Node runtime host; tests inject the request bridge and server factory.
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
	 * Client disconnects are treated as normal aborts and are not logged. Other
	 * failures here (the response write, or an uninitialised adapter) are logged
	 * with their stack and answered with 500.
	 *
	 * The hostname is resolved to its first address before `listen()`, which is
	 * what Node does internally. Bun instead tries every address the name resolves
	 * to, so when `localhost:<port>` is taken on `::1` it binds `127.0.0.1` and
	 * never reports `EADDRINUSE`, leaving two servers behind one origin.
	 */
	public async start(serveOptions: NodeRuntimeServeOptions): Promise<NodeServerInstance> {
		const hostname = String(serveOptions.hostname ?? DEFAULT_ECOPAGES_HOSTNAME);
		const port = Number(serveOptions.port ?? DEFAULT_ECOPAGES_PORT);
		const { address } = await lookup(hostname);

		let server: NodeServerInstance;
		server = this.serverFactory(async (req, res) => {
			try {
				const runtimeOrigin = this.getOrigin(server, serveOptions);
				const webRequest = this.requestBridge.createWebRequest(req, runtimeOrigin);
				const response = await serveOptions.handleRequest(webRequest);
				await this.requestBridge.sendNodeResponse(res, response);
			} catch (error) {
				if (isNodeClientAbortError(error)) {
					return;
				}

				appLogger.error('Node server adapter request failed', error);
				res.statusCode = 500;
				res.end('Internal Server Error');
			}
		});

		const sockets = new Set<Socket>();
		this.sockets.set(server, sockets);
		server.on('connection', (socket) => {
			sockets.add(socket);
			socket.once('close', () => sockets.delete(socket));
		});

		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(port, address, () => {
				server.off('error', reject);
				resolve();
			});
		});

		return server;
	}

	/**
	 * Stops the Node HTTP server and, by default, force-closes any remaining open
	 * connections, WebSocket connections included.
	 *
	 * @remarks
	 * With `force: false` the returned promise waits until every connection ends
	 * on its own, so an open WebSocket keeps it pending.
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
				for (const socket of this.sockets.get(server) ?? []) socket.destroy();
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
