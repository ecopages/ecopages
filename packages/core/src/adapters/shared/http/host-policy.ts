import type { AllowedHosts } from '../../../config/user-config-types.ts';

/**
 * Decides whether the server answers a request for a hostname.
 *
 * @remarks
 * `hostname` is the hostname of the request origin as `URL` reports it (lowercase, IPv6 in brackets, no port).
 * Once a request passes, `request.url` is the address the visitor used and may be compared with `Origin`.
 */
export type HostPolicy = {
	allows(hostname: string): boolean;
};

const IPV4_LITERAL = /^\d{1,3}(?:\.\d{1,3}){3}$/u;
const HOSTNAME_ENTRY = /^[a-z0-9_](?:[a-z0-9_.-]*[a-z0-9_])?$/u;
const OPTION_HELP = 'Use a list of hostnames and "*.example.com" wildcards, or true to allow any host (unsafe).';

function normalizeHostname(hostname: string): string {
	const lowercase = hostname.toLowerCase();
	return lowercase.endsWith('.') ? lowercase.slice(0, -1) : lowercase;
}

function isBracketedIp(hostname: string): boolean {
	return hostname.startsWith('[') && hostname.endsWith(']') && !/[\s/]/u.test(hostname);
}

function isIpLiteral(hostname: string): boolean {
	return IPV4_LITERAL.test(hostname) || isBracketedIp(hostname);
}

function isLocalName(hostname: string): boolean {
	return hostname === 'localhost' || hostname.endsWith('.localhost');
}

function hostnameOfBaseUrl(baseUrl: string): string | undefined {
	try {
		return normalizeHostname(new URL(baseUrl).hostname);
	} catch {
		return undefined;
	}
}

function isValidEntry(entry: unknown): boolean {
	if (typeof entry !== 'string') return false;
	const hostname = entry.toLowerCase();
	if (hostname.startsWith('*.')) return HOSTNAME_ENTRY.test(hostname.slice(2));
	return HOSTNAME_ENTRY.test(hostname) || isBracketedIp(hostname);
}

/**
 * Fails the load of an `allowedHosts` option that is not `true` or a list of hostnames and `*.domain` wildcards.
 *
 * @remarks
 * Entries are hostnames only: a scheme, port, path or a wildcard anywhere but the first label is almost always a
 * mistake that would silently match nothing, so it is refused when the config loads.
 */
export function assertAllowedHosts(allowedHosts: unknown): asserts allowedHosts is AllowedHosts | undefined {
	if (allowedHosts === undefined || allowedHosts === true) return;
	if (!Array.isArray(allowedHosts)) {
		throw new Error(`Invalid "allowedHosts" option ${JSON.stringify(allowedHosts)}. ${OPTION_HELP}`);
	}
	for (const entry of allowedHosts) {
		if (!isValidEntry(entry)) {
			throw new Error(
				`Invalid "allowedHosts" entry ${JSON.stringify(entry)}: it is not a hostname. ${OPTION_HELP}`,
			);
		}
	}
}

/**
 * Builds the host policy of a server from the `allowedHosts` and `baseUrl` options.
 *
 * @remarks
 * Production allows `allowedHosts` when it is set, and the host of `baseUrl` otherwise, so loopback is refused
 * unless one of them names it. Development always allows `localhost`, its subdomains and IP literals, then the
 * `baseUrl` host or `allowedHosts` the same way. An IP literal is safe to allow because DNS rebinding needs a name
 * that resolves to the server, which an IP address is not. `true` allows every host.
 *
 * A `*.example.com` entry matches a subdomain of any depth but not `example.com`. Ports are not compared; a
 * handler that needs the port compares the full origin.
 */
export function createHostPolicy(input: {
	allowedHosts: AllowedHosts | undefined;
	baseUrl: string;
	development: boolean;
}): HostPolicy {
	if (input.allowedHosts === true) return { allows: () => true };

	const exact = new Set<string>();
	const suffixes: string[] = [];
	const entries = input.allowedHosts ?? [hostnameOfBaseUrl(input.baseUrl)];
	for (const entry of entries) {
		if (entry === undefined) continue;
		const hostname = normalizeHostname(entry);
		if (hostname.startsWith('*.')) suffixes.push(hostname.slice(1));
		else exact.add(hostname);
	}

	return {
		allows(hostname) {
			const candidate = normalizeHostname(hostname);
			if (candidate === '') return false;
			if (input.development && (isLocalName(candidate) || isIpLiteral(candidate))) return true;
			return (
				exact.has(candidate) ||
				suffixes.some((suffix) => candidate.length > suffix.length && candidate.endsWith(suffix))
			);
		},
	};
}
