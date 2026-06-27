import { StaticContentServer } from '../../dev/sc-server.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { PortManager } from '../shared/port-manager.ts';
import type { StaticPreviewHost, StaticPreviewHostStartOptions } from '../shared/static-preview-host.ts';

type BunStaticPreviewServer = {
	server: {
		port?: number;
	} | null;
	stop(): void;
};

type BunStaticPreviewServerFactory = {
	createServer(args: { appConfig: EcoPagesAppConfig; options: { port: number } }): BunStaticPreviewServer;
};

type BunStaticPreviewLogger = {
	error(message: string): unknown;
};

export class BunStaticPreviewHost implements StaticPreviewHost {
	private previewServer: BunStaticPreviewServer | null = null;

	constructor(
		private readonly previewServerFactory: BunStaticPreviewServerFactory = StaticContentServer,
		private readonly logger: BunStaticPreviewLogger = appLogger,
	) {}

	public async start(options: StaticPreviewHostStartOptions): Promise<number | null> {
		await this.stop();

		const portManager = new PortManager({
			startOnPort: async (port) => {
				this.previewServer = this.previewServerFactory.createServer({
					appConfig: options.appConfig,
					options: { port },
				});

				return this.previewServer.server?.port ?? null;
			},
			warn: (message) => appLogger.warn(message),
		});

		const previewPort = await portManager.bind({
			preferredPort: options.port,
			allowPortFallback: options.allowPortFallback === true,
		});

		if (!previewPort) {
			this.logger.error('Failed to start preview server');
		}

		return previewPort;
	}

	public async stop(): Promise<void> {
		this.previewServer?.stop();
		this.previewServer = null;
	}
}
