import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../../constants.ts';
import { getEcopagesEnv } from '../../../env.ts';
import type { ReturnParseCliArgs } from '../../../utils/parse-cli-args.ts';

export type RuntimeBinding = {
	runtimeOrigin: string;
	serveOptions: Record<string, unknown>;
	watch: boolean;
	/** Whether preview may bind to the next free port when the preferred port is busy. */
	allowPortFallback: boolean;
};

function normalizeOriginHostname(hostname: string): string {
	if (hostname.includes(':') && !hostname.startsWith('[') && !hostname.endsWith(']')) {
		return `[${hostname}]`;
	}

	return hostname;
}

export function resolveServeRuntimeOrigin(serveOptions: { hostname?: string; port?: number | string }): string {
	const hostname = normalizeOriginHostname(String(serveOptions.hostname ?? DEFAULT_ECOPAGES_HOSTNAME));
	const port = Number(serveOptions.port ?? DEFAULT_ECOPAGES_PORT);

	return `http://${hostname}:${port}`;
}

export function resolveRuntimeBinding(options: {
	cliArgs: ReturnParseCliArgs;
	serverOptions?: Record<string, unknown>;
	env?: NodeJS.ProcessEnv;
}): RuntimeBinding {
	const env = options.env ?? process.env;
	const envPort = getEcopagesEnv('ECOPAGES_PORT', env);
	const envHostname = getEcopagesEnv('ECOPAGES_HOSTNAME', env);
	const portExplicitlyConfigured =
		options.cliArgs.port !== undefined || Boolean(envPort) || options.serverOptions?.port !== undefined;
	const preferredPort = options.cliArgs.port ?? (envPort ? Number(envPort) : undefined) ?? DEFAULT_ECOPAGES_PORT;
	const preferredHostname = options.cliArgs.hostname ?? envHostname ?? DEFAULT_ECOPAGES_HOSTNAME;

	return {
		allowPortFallback: !portExplicitlyConfigured,
		runtimeOrigin: resolveServeRuntimeOrigin({
			hostname: preferredHostname,
			port: preferredPort,
		}),
		serveOptions: {
			port: preferredPort,
			hostname: preferredHostname,
			...(options.serverOptions ?? {}),
		},
		watch: options.cliArgs.dev,
	};
}
