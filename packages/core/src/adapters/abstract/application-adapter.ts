import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { type ReturnParseCliArgs, parseCliArgs } from '../../utils/parse-cli-args.ts';

/**
 * Configuration options for application adapters
 */
export interface ApplicationAdapterOptions {
  appConfig: EcoPagesAppConfig;
  serverOptions?: Record<string, any>;
}

/**
 * Common interface for application adapters
 */
export interface ApplicationAdapter<T = any> {
  start(): Promise<T | void>;
}

/**
 * Abstract base class for application adapters across different runtimes
 */
export abstract class AbstractApplicationAdapter<
  TOptions extends ApplicationAdapterOptions = ApplicationAdapterOptions,
  TServer = any,
> implements ApplicationAdapter<TServer>
{
  protected appConfig: EcoPagesAppConfig;
  protected serverOptions: Record<string, any>;
  protected cliArgs: ReturnParseCliArgs;

  constructor(options: TOptions) {
    this.appConfig = options.appConfig;
    this.serverOptions = options.serverOptions || {};
    this.cliArgs = parseCliArgs();
  }

  /**
   * Initialize the server adapter based on the runtime
   */
  protected abstract initializeServerAdapter(): Promise<any>;

  /**
   * Start the application server
   */
  public abstract start(): Promise<TServer | void>;
}
