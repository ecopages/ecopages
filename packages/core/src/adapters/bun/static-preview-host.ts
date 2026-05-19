import { StaticContentServer } from '../../dev/sc-server.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
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
		await new Promise((resolve) => setTimeout(resolve, 100));

		for (let attempt = 0; attempt < 20; attempt += 1) {
			try {
				this.previewServer = this.previewServerFactory.createServer({
					appConfig: options.appConfig,
					options: { port: options.port },
				});

				const previewPort = this.previewServer.server?.port;
				if (previewPort) {
					return previewPort;
				}

				break;
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				const errorCode =
					typeof error === 'object' && error !== null && 'code' in error
						? String((error as { code?: unknown }).code)
						: undefined;
				const isPortReleaseRace = errorCode === 'EADDRINUSE' || errorMessage.includes('EADDRINUSE');

				if (!isPortReleaseRace || attempt === 19) {
					throw error;
				}

				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}

		this.logger.error('Failed to start preview server');
		return null;
	}

	public async stop(): Promise<void> {
		this.previewServer?.stop();
		this.previewServer = null;
	}
}
