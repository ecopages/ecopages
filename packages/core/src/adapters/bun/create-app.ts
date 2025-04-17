import type { Server } from 'bun';
import { appLogger } from '../../global/app-logger.ts';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { parseCliArgs } from '../../utils/parse-cli-args.ts';
import { AbstractApplicationAdapter, type ApplicationAdapterOptions } from '../abstract/application-adapter.ts';
import { type BunServerAdapterResult, createBunServerAdapter } from './server-adapter.ts';

export interface BunApplicationOptions extends ApplicationAdapterOptions {
  appConfig: EcoPagesAppConfig;
  serverOptions?: Record<string, any>;
}

/**
 * Bun-specific application adapter implementation
 */
export class BunApplicationAdapter extends AbstractApplicationAdapter<BunApplicationOptions, Server> {
  private serverAdapter!: BunServerAdapterResult;

  constructor(options: BunApplicationOptions) {
    super(options, parseCliArgs());
  }

  /**
   * Initialize the Bun server adapter
   */
  protected async initializeServerAdapter(): Promise<BunServerAdapterResult> {
    const { dev, port, hostname } = this.cliArgs;

    return await createBunServerAdapter({
      appConfig: this.appConfig,
      options: { watch: dev },
      serveOptions: {
        port,
        hostname,
        ...this.serverOptions,
      },
    });
  }

  /**
   * Start the Bun application server
   */
  public async start(): Promise<Server | void> {
    if (!this.serverAdapter) {
      this.serverAdapter = await this.initializeServerAdapter();
    }

    const { dev, preview, build } = this.cliArgs;
    const enableHmr = dev || (!preview && !build);
    const options = this.serverAdapter.getServerOptions({ enableHmr });

    const server = Bun.serve(options);

    if (!build && !preview) {
      appLogger.info(`Server running at http://${server.hostname}:${server.port}`);
    }

    if (build || preview) {
      appLogger.debugTime('Building static pages');
      await this.serverAdapter.buildStatic({ preview });
      server.stop(true);
      appLogger.debugTimeEnd('Building static pages');

      if (build) {
        process.exit(0);
      }
    }

    return server;
  }
}

/**
 * Factory function to create a Bun application
 */
export async function createApp(
  options: BunApplicationOptions,
): Promise<AbstractApplicationAdapter<BunApplicationOptions, Server>> {
  return new BunApplicationAdapter(options);
}
