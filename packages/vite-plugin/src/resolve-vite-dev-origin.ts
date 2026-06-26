import type { ResolvedConfig } from 'vite';

function normalizeOriginHostname(hostname: string): string {
	if (hostname.includes(':') && !hostname.startsWith('[') && !hostname.endsWith(']')) {
		return `[${hostname}]`;
	}

	return hostname;
}

/**
 * Resolves the public origin for the active Vite dev server.
 *
 * Mirrors ecopages CLI `resolveServeRuntimeOrigin` so middleware `Request`
 * objects use the same host/port the browser is actually visiting.
 */
export function resolveViteDevServerOrigin(config: ResolvedConfig): string {
	const configuredOrigin = config.server.origin?.trim();
	if (configuredOrigin) {
		return configuredOrigin.replace(/\/$/, '');
	}

	const hostSetting = config.server.host;
	const hostname =
		hostSetting === true || hostSetting === undefined
			? 'localhost'
			: Array.isArray(hostSetting)
				? String(hostSetting[0] ?? 'localhost')
				: String(hostSetting);

	const port = Number(config.server.port ?? 5173);
	const normalizedHost = normalizeOriginHostname(hostname);

	return `http://${normalizedHost}:${port}`;
}

/**
 * Returns the best available dev-server origin, preferring the resolved Vite
 * server settings over a stale config fallback.
 */
export function resolveEcopagesDevServerOrigin(
	resolvedOrigin: string | undefined,
	fallbackBaseUrl: string | undefined,
): string {
	if (resolvedOrigin) {
		return resolvedOrigin;
	}

	if (fallbackBaseUrl) {
		return fallbackBaseUrl.replace(/\/$/, '');
	}

	return 'http://localhost:3000';
}
