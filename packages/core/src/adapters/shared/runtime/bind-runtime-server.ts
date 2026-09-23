import type { RuntimeHost, RuntimeHostStartOptions } from './runtime-host.ts';
import { PortManager } from './port-manager.ts';
import { appLogger } from '../../../global/app-logger.ts';

/**
 * Starts a runtime server, optionally negotiating a fallback port via
 * {@link PortManager}.
 */
export async function bindRuntimeServer<TServer, TServeOptions extends { port?: number | string; hostname?: string }>(
	runtimeHost: RuntimeHost<TServer, TServeOptions>,
	options: {
		startOptions: RuntimeHostStartOptions<TServeOptions>;
		allowPortFallback: boolean;
		usePortManager: boolean;
	},
): Promise<{ server: TServer; port: number; runtimeOrigin: string }> {
	const preferredPort = Number(options.startOptions.serveOptions.port);
	if (!options.usePortManager) {
		const server = await runtimeHost.start(options.startOptions);
		const runtimeOrigin = runtimeHost.getOrigin(server, options.startOptions.serveOptions);
		return {
			server,
			port: Number(new URL(runtimeOrigin).port || preferredPort),
			runtimeOrigin,
		};
	}

	let activeServer: TServer | undefined;
	let activeRuntimeOrigin: string | undefined;

	const portManager = new PortManager({
		startOnPort: async (port) => {
			const serveOptions = {
				...options.startOptions.serveOptions,
				port,
			};
			const server = await runtimeHost.start({
				...options.startOptions,
				serveOptions,
			});
			const runtimeOrigin = runtimeHost.getOrigin(server, serveOptions);
			const boundPort = Number(new URL(runtimeOrigin).port || port);
			activeServer = server;
			activeRuntimeOrigin = runtimeOrigin;
			return boundPort;
		},
		warn: (message) => appLogger.warn(message),
	});

	const boundPort = await portManager.bind({
		preferredPort,
		allowPortFallback: options.allowPortFallback,
	});

	if (!boundPort || !activeServer || !activeRuntimeOrigin) {
		throw new Error(`Failed to bind development server on port ${preferredPort}.`);
	}

	return {
		server: activeServer,
		port: boundPort,
		runtimeOrigin: activeRuntimeOrigin,
	};
}
