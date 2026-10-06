import { WebSocketServer } from 'ws';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';

export interface NodeServerDevRuntime {
	websocketServer: WebSocketServer;
	bridge: NodeClientBridge;
	hmrManager: NodeHmrManager;
}

/** Creates the dev WebSocket server, client bridge and HMR manager for `appConfig`. */
export function createNodeServerDevRuntime(appConfig: EcoPagesAppConfig): NodeServerDevRuntime {
	const websocketServer = new WebSocketServer({ noServer: true });
	const bridge = new NodeClientBridge();
	const hmrManager = new NodeHmrManager({ appConfig, bridge });

	return { websocketServer, bridge, hmrManager };
}
