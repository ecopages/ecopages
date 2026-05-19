import { WebSocketServer } from 'ws';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { NodeClientBridge } from './node-client-bridge.ts';
import { NodeHmrManager } from './node-hmr-manager.ts';

export interface NodeServerDevRuntime {
	websocketServer: WebSocketServer;
	bridge: NodeClientBridge;
	hmrManager: NodeHmrManager;
}

export interface NodeServerDevRuntimeFactory {
	create(options: { appConfig: EcoPagesAppConfig }): NodeServerDevRuntime;
}

export class DefaultNodeServerDevRuntimeFactory implements NodeServerDevRuntimeFactory {
	public create(options: { appConfig: EcoPagesAppConfig }): NodeServerDevRuntime {
		const websocketServer = new WebSocketServer({ noServer: true });
		const bridge = new NodeClientBridge();
		const hmrManager = new NodeHmrManager({ appConfig: options.appConfig, bridge });

		return {
			websocketServer,
			bridge,
			hmrManager,
		};
	}
}
