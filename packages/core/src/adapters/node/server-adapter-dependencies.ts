import { WebSocketServer } from 'ws';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { setAppDevClientBridge } from '../../dev/client-bridge-registry.ts';
import { setAppHmrManager } from '../../dev/hmr-manager-registry.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';

export interface NodeServerDevRuntime {
	websocketServer: WebSocketServer;
	bridge: NodeClientBridge;
	hmrManager: NodeHmrManager;
}

/** Creates the dev WebSocket server, client bridge and HMR manager, and registers them for `appConfig`. */
export function createNodeServerDevRuntime(appConfig: EcoPagesAppConfig): NodeServerDevRuntime {
	const websocketServer = new WebSocketServer({ noServer: true });
	const bridge = new NodeClientBridge();
	const hmrManager = new NodeHmrManager({ appConfig, bridge });
	setAppDevClientBridge(appConfig, bridge);
	setAppHmrManager(appConfig, hmrManager);

	return { websocketServer, bridge, hmrManager };
}
