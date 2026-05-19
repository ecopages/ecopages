import type { ServerWebSocket, WebSocketHandler } from 'bun';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { ClientBridge } from './client-bridge.ts';
import {
	InMemoryEntrypointDependencyGraph,
	type EntrypointDependencyGraph,
} from '../../services/runtime-state/entrypoint-dependency-graph.service.ts';
import { SharedHmrManager } from '../shared/shared-hmr-manager.ts';

type BunSocket = ServerWebSocket<unknown>;
type BunSocketHandler = WebSocketHandler<unknown>;

export interface HmrManagerParams {
	appConfig: EcoPagesAppConfig;
	bridge: ClientBridge;
}

/**
 * Bun development HMR manager.
 *
 * @remarks
 * Bun shares the same public contract as the Node manager: page entrypoints are
 * strict integration-owned registrations, while generic script assets use their
 * own explicit registration path.
 */
export class HmrManager extends SharedHmrManager {
	private wsHandler!: {
		open: (ws: BunSocket) => void;
		close: (ws: BunSocket) => void;
	};

	/**
	 * Creates the Bun HMR manager around the shared HMR orchestration pipeline.
	 *
	 * @remarks
	 * Bun delegates route watching, rebuild dispatch, and runtime bundle
	 * generation to `SharedHmrManager`. The Bun subclass only supplies the
	 * transport-specific dependency graph policy and websocket hook surface.
	 */
	constructor({ appConfig, bridge }: HmrManagerParams) {
		super({ appConfig, bridge });
	}

	/**
	 * Reuses the shared in-memory dependency graph when possible and otherwise
	 * creates the Bun-compatible default graph implementation.
	 */
	protected createEntrypointDependencyGraph(existingEntrypointDependencyGraph: EntrypointDependencyGraph) {
		return existingEntrypointDependencyGraph instanceof InMemoryEntrypointDependencyGraph
			? existingEntrypointDependencyGraph
			: new InMemoryEntrypointDependencyGraph();
	}

	/**
	 * Returns the Bun websocket hooks that attach and detach live HMR subscribers.
	 *
	 * @remarks
	 * `SharedHmrManager` stores the bridge behind the transport-agnostic
	 * `IClientBridge` contract because most HMR coordination only needs broadcast
	 * behavior. Bun connection lifecycle wiring is the point where that abstraction
	 * intentionally narrows back to the concrete Bun bridge so websocket instances
	 * can be tracked directly.
	 */
	public getWebSocketHandler(): BunSocketHandler {
		const bridge = this.bridge as ClientBridge;

		const open = (ws: BunSocket) => {
			bridge.subscribe(ws);
			appLogger.debug(`[HmrManager] Connection opened. Subscribers: ${bridge.subscriberCount}`);
		};

		const close = (ws: BunSocket) => {
			bridge.unsubscribe(ws);
			appLogger.debug(`[HmrManager] Connection closed. Subscribers: ${bridge.subscriberCount}`);
		};

		this.wsHandler = { open, close };

		return {
			open: this.wsHandler.open,
			close: this.wsHandler.close,
			message: (_ws, message) => {
				appLogger.debug('[HMR] Received message from client:', message);
			},
		};
	}
}
