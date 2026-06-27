import type { AddressInfo } from 'node:net';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { PortManager } from '../shared/port-manager.ts';
import type { StaticPreviewHost, StaticPreviewHostStartOptions } from '../shared/static-preview-host.ts';
import { NodeStaticContentServer } from './static-content-server.ts';

type NodeStaticPreviewServer = {
	start(): Promise<{ address(): AddressInfo | string | null }>;
	stop(force?: boolean): Promise<void>;
};

type NodeStaticPreviewServerFactory = new (args: {
	appConfig: EcoPagesAppConfig;
	options?: {
		hostname?: string;
		port?: number;
	};
}) => NodeStaticPreviewServer;

/**
 * Node preview-host wrapper that manages the lifecycle of the static preview
 * server used after a build.
 *
 * @remarks
 * The host separates preview-server construction from lifecycle control so the
 * Node server adapter can restart preview serving safely across repeated build
 * and preview flows.
 */
export class NodeStaticPreviewHost implements StaticPreviewHost {
	private previewServer: NodeStaticPreviewServer | null = null;
	private stopPromise: Promise<void> | null = null;

	/**
	 * Creates the preview host with an injectable preview-server constructor.
	 */
	constructor(private readonly previewServerFactory: NodeStaticPreviewServerFactory = NodeStaticContentServer) {}

	/**
	 * Starts the Node preview host after fully draining any previous preview server
	 * shutdown that may still be in flight.
	 *
	 * @remarks
	 * The host only publishes a new preview server after `start()` succeeds. That
	 * keeps failed startup attempts from replacing the last known-good server with a
	 * half-initialized instance.
	 */
	public async start(options: StaticPreviewHostStartOptions): Promise<number | null> {
		await this.stop();

		const portManager = new PortManager({
			startOnPort: async (port) => {
				const previewServer = new this.previewServerFactory({
					appConfig: options.appConfig,
					options: {
						hostname: options.hostname,
						port,
					},
				});

				const server = await previewServer.start();
				this.previewServer = previewServer;
				const address = server.address();

				if (address && typeof address === 'object') {
					return address.port;
				}

				return port;
			},
			warn: (message) => appLogger.warn(message),
		});

		const previewPort = await portManager.bind({
			preferredPort: options.port,
			allowPortFallback: options.allowPortFallback === true,
		});

		if (!previewPort) {
			this.previewServer = null;
		}

		return previewPort;
	}

	/**
	 * Stops the active preview server and coalesces overlapping stop requests onto
	 * the same shutdown promise.
	 *
	 * @remarks
	 * The host keeps the server reference until shutdown succeeds. If shutdown
	 * fails, callers can still retry `stop()` or inspect the same live instance
	 * instead of losing the handle during a rejected async stop.
	 */
	public async stop(force = true): Promise<void> {
		if (this.stopPromise) {
			await this.stopPromise;
			return;
		}

		if (!this.previewServer) {
			return;
		}

		const activePreviewServer = this.previewServer;
		this.stopPromise = activePreviewServer
			.stop(force)
			.then(() => {
				if (this.previewServer === activePreviewServer) {
					this.previewServer = null;
				}
			})
			.finally(() => {
				this.stopPromise = null;
			});

		await this.stopPromise;
	}
}
