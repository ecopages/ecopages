import type { EcoPagesAppConfig } from '../../internal-types.ts';

/**
 * Configuration options for all server adapters
 */
export interface ServerAdapterOptions {
  appConfig: EcoPagesAppConfig;
  options?: {
    watch?: boolean;
    [key: string]: any;
  };
  serveOptions?: Record<string, any>;
}

/**
 * Base adapter result containing common functionalities
 * across different runtime implementations
 */
export interface ServerAdapterResult {
  getServerOptions: (options?: { enableHmr?: boolean }) => any;
  buildStatic: (options?: { preview?: boolean }) => Promise<void>;
}

/**
 * Abstract base class for server adapters across different runtimes
 */
export abstract class AbstractServerAdapter<
  TOptions extends ServerAdapterOptions = ServerAdapterOptions,
  TResult extends ServerAdapterResult = ServerAdapterResult,
> {
  protected appConfig: EcoPagesAppConfig;
  protected options: TOptions['options'];
  protected serveOptions: TOptions['serveOptions'];

  constructor(options: TOptions) {
    this.appConfig = options.appConfig;
    this.options = options.options || {};
    this.serveOptions = options.serveOptions || {};
  }

  /**
   * Initialize the server adapter
   */
  public abstract initialize(): Promise<void>;

  /**
   * Create server options specific to the runtime
   */
  public abstract getServerOptions(options?: { enableHmr?: boolean }): any;

  /**
   * Build static files for the application
   */
  public abstract buildStatic(options?: { preview?: boolean }): Promise<void>;

  /**
   * Factory method to create a server adapter with runtime-specific functionality
   */
  public abstract createAdapter(): Promise<TResult>;

  /**
   * Handle HTTP requests
   */
  public abstract handleRequest(request: Request): Promise<Response>;
}
