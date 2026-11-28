import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { TrustProxy } from '../../config/user-config-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { HostPolicy } from '../shared/http/host-policy.ts';
import { resolveHeaderOrigin } from './http-request-bridge.ts';

const MAX_LOGGED_HOSTS = 50;
const LOG_WINDOW_MS = 10 * 60 * 1000;
const loggedHosts = new Set<string>();
let windowStartedAt = 0;

/**
 * Warns once per refused host, up to {@link MAX_LOGGED_HOSTS} in a ten minute window, so a client that sends many
 * invented hosts cannot flood the log or use up the warnings for good: a later misconfiguration is logged in the
 * next window.
 */
function logRefusedHost(hostname: string | null): void {
	const label = hostname === null ? 'without a usable Host' : `for host ${JSON.stringify(hostname.slice(0, 100))}`;
	const now = Date.now();
	if (now - windowStartedAt > LOG_WINDOW_MS) {
		loggedHosts.clear();
		windowStartedAt = now;
	}
	if (loggedHosts.size >= MAX_LOGGED_HOSTS || loggedHosts.has(label)) return;
	loggedHosts.add(label);
	appLogger.warn(
		`Refused a request ${label}. To serve it, set baseUrl to its address or add it to allowedHosts in eco.config.ts.`,
	);
}

/**
 * The origin a Node request names when the server answers its host, or `null` when it must be refused.
 *
 * @remarks
 * This is the one place the host is read: the origin it returns is the origin of `request.url`, and a WebSocket
 * upgrade compares `Origin` with it, so the host that was checked is the host used by construction. A request that
 * names no usable host is refused. Each refused host is logged once, up to a small cap per window, so a client that
 * sends many invented hosts cannot flood the log.
 */
export function resolveAllowedOrigin(
	req: IncomingMessage,
	runtimeOrigin: string,
	trustProxy: TrustProxy | undefined,
	policy: HostPolicy,
): string | null {
	const origin = resolveHeaderOrigin(req, runtimeOrigin, trustProxy);
	const hostname = origin === null ? null : new URL(origin).hostname;
	if (hostname !== null && policy.allows(hostname)) return origin;
	logRefusedHost(hostname);
	return null;
}

/** Answers HTTP 400 for a request whose host the server does not serve, and closes the connection. */
export function refuseHost(res: ServerResponse): void {
	res.statusCode = 400;
	res.setHeader('content-type', 'text/plain; charset=utf-8');
	res.setHeader('connection', 'close');
	res.end('Bad Request: this host is not served.');
}

/** Answers an upgrade request whose host the server does not serve with HTTP 400 and closes the socket. */
export function refuseUpgradeHost(socket: Duplex): void {
	socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}

/**
 * Whether a WebSocket upgrade comes from a page of the origin it asks, or from a client that is not a browser.
 *
 * @remarks
 * A browser sends `Origin` on every WebSocket handshake and lets any page open a socket to any host, so a page on
 * another site could otherwise talk to a server on the visitor's machine (cross-site WebSocket hijacking). `Origin`
 * must equal `checkedOrigin`, the origin `resolveAllowedOrigin()` returned; a handshake without it comes from a client
 * that is not a browser and passes. `Origin: null`, a list and any other value are refused.
 */
export function isUpgradeOriginAllowed(req: IncomingMessage, checkedOrigin: string): boolean {
	const origin = req.headers.origin;
	return origin === undefined || origin === checkedOrigin;
}

/** Answers an upgrade from another origin with HTTP 403 and closes the socket. */
export function refuseUpgradeOrigin(socket: Duplex): void {
	socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
}
