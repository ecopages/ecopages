import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { TrustProxy } from '../../config/user-config-types.ts';
import { appLogger } from '../../global/app-logger.ts';
import type { HostPolicy } from '../shared/http/host-policy.ts';
import { resolveRequestHostname } from './http-request-bridge.ts';

const MAX_LOGGED_HOSTS = 50;
const loggedHosts = new Set<string>();

function logRefusedHost(hostname: string | null): void {
	const label = hostname === null ? 'without a usable Host' : `for host ${JSON.stringify(hostname.slice(0, 100))}`;
	if (loggedHosts.size >= MAX_LOGGED_HOSTS || loggedHosts.has(label)) return;
	loggedHosts.add(label);
	appLogger.warn(
		`Refused a request ${label}. To serve it, set baseUrl to its address or add it to allowedHosts in eco.config.ts.`,
	);
}

/**
 * Whether the server answers a Node request, judged by the host its URL will carry.
 *
 * @remarks
 * A request that names no usable host is refused. Each refused host is logged once, up to a small cap, so a
 * client that sends many invented hosts cannot flood the log. Without a `policy` every request is answered.
 */
export function isRequestHostAllowed(
	req: IncomingMessage,
	runtimeOrigin: string,
	trustProxy: TrustProxy | undefined,
	policy: HostPolicy | undefined,
): boolean {
	if (!policy) return true;
	const hostname = resolveRequestHostname(req, runtimeOrigin, trustProxy);
	if (hostname !== null && policy.allows(hostname)) return true;
	logRefusedHost(hostname);
	return false;
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
