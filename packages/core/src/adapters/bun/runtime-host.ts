import type { Server } from 'bun';
import { getBunRuntime } from '../../utils/runtime.ts';
import { resolveServeRuntimeOrigin } from '../shared/runtime-app-bootstrap.ts';
import type { RuntimeHost, RuntimeHostStartOptions } from '../shared/runtime-host.ts';

type BunRuntimeProvider = {
	serve(options: Bun.Serve.Options<unknown>): Server<unknown>;
};

/**
 * Bun runtime host that adapts the shared runtime lifecycle contract onto
 * `Bun.serve()`.
 *
 * @remarks
 * The injected runtime provider exists so tests and non-Bun call sites can
 * construct the host without assuming `globalThis.Bun` is present. The provider
 * returns `null` instead of `undefined` to keep that absence explicit at the
 * host boundary.
 */
export class BunRuntimeHost<WebSocketData = undefined> implements RuntimeHost<
	Server<WebSocketData>,
	Bun.Serve.Options<WebSocketData>
> {
	/**
	 * Creates a Bun runtime host with an injectable runtime lookup.
	 *
	 * @remarks
	 * Production code uses the default `getBunRuntime()` lookup. Tests may inject a
	 * fake provider that either supplies a `serve()` implementation or returns
	 * `null` to verify the runtime-required failure path.
	 */
	constructor(private readonly runtimeProvider: () => BunRuntimeProvider | null = () => getBunRuntime() ?? null) {}

	/**
	 * Starts the Bun server using the already-composed serve options from the
	 * shared application bootstrap.
	 */
	public async start(
		options: RuntimeHostStartOptions<Bun.Serve.Options<WebSocketData>>,
	): Promise<Server<WebSocketData>> {
		const bun = this.runtimeProvider();
		if (!bun) {
			throw new Error('Bun runtime is required for the Bun adapter');
		}

		return bun.serve(options.serveOptions as Bun.Serve.Options<unknown>) as Server<WebSocketData>;
	}

	/**
	 * Stops the active Bun server immediately.
	 *
	 * @remarks
	 * The shared runtime-host contract accepts optional stop options, but Bun's
	 * server API already models the shutdown behavior directly. This host always
	 * uses Bun's forceful stop path so preview and embedded runtime shutdowns do
	 * not linger on open connections.
	 */
	public async stop(server: Server<WebSocketData>): Promise<void> {
		server.stop(true);
	}

	/**
	 * Resolves the externally reported runtime origin from the active server.
	 *
	 * @remarks
	 * Bun may finalize the hostname or port differently from the requested serve
	 * options. This method prefers the live server binding and only falls back to
	 * the requested options when Bun leaves a field unset.
	 */
	public getOrigin(server: Server<WebSocketData>, fallbackServeOptions: Bun.Serve.Options<WebSocketData>): string {
		return resolveServeRuntimeOrigin({
			hostname: server.hostname ?? fallbackServeOptions.hostname,
			port: server.port ?? fallbackServeOptions.port,
		});
	}
}
