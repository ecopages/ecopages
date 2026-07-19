export interface RuntimeHost<TServer, TServeOptions> {
	start(options: RuntimeHostStartOptions<TServeOptions>): Promise<TServer>;
	stop(server: TServer, options?: { force?: boolean }): Promise<void>;
	getOrigin(server: TServer, fallbackServeOptions: TServeOptions): string;
}

export interface RuntimeHostStartOptions<TServeOptions> {
	serveOptions: TServeOptions;
	handleRequest(request: Request): Promise<Response>;
	onError(error: Error): Promise<void> | void;
}
