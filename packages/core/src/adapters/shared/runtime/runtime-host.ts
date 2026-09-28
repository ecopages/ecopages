export interface RuntimeHost<TServer, TServeOptions> {
	start(options: RuntimeHostStartOptions<TServeOptions>): Promise<TServer>;
	stop(server: TServer, options?: { force?: boolean }): Promise<void>;
	getOrigin(server: TServer, fallbackServeOptions: TServeOptions): string;
}

/**
 * @remarks
 * Request handling travels inside `serveOptions`, as Bun's `fetch` does, so each
 * runtime host receives only the callbacks it actually calls.
 */
export interface RuntimeHostStartOptions<TServeOptions> {
	serveOptions: TServeOptions;
}
