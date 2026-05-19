import { DEFAULT_ECOPAGES_HOSTNAME, DEFAULT_ECOPAGES_PORT } from '../../config/constants.ts';
import type { ReturnParseCliArgs } from '../../utils/parse-cli-args.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

export type RuntimeBinding = {
	preferredPort: number;
	preferredHostname: string;
	runtimeOrigin: string;
	serveOptions: Record<string, unknown>;
	watch: boolean;
};

export type StaticRuntimeMode = {
	requiresFetchRuntime: boolean;
	canBuildWithoutRuntimeServer: boolean;
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
	const preferredPort =
		options.cliArgs.port ?? (env.ECOPAGES_PORT ? Number(env.ECOPAGES_PORT) : undefined) ?? DEFAULT_ECOPAGES_PORT;
	const preferredHostname = options.cliArgs.hostname ?? env.ECOPAGES_HOSTNAME ?? DEFAULT_ECOPAGES_HOSTNAME;

	return {
		preferredPort,
		preferredHostname,
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

export function resolveStaticRuntimeMode(options: {
	appConfig: EcoPagesAppConfig;
	cliArgs: ReturnParseCliArgs;
}): StaticRuntimeMode {
	const requiresFetchRuntime = options.appConfig.integrations.some(
		(integration) => integration.staticBuildStep === 'fetch',
	);
	const canBuildWithoutRuntimeServer = (options.cliArgs.build || options.cliArgs.preview) && !requiresFetchRuntime;

	return {
		requiresFetchRuntime,
		canBuildWithoutRuntimeServer,
	};
}
