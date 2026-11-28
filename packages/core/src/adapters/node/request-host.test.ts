import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrustProxy } from '../../config/user-config-types.ts';
import { createHostPolicy } from '../shared/http/host-policy.ts';
import { isUpgradeOriginAllowed } from './request-host.ts';

const policy = createHostPolicy({ allowedHosts: undefined, baseUrl: 'https://shop.example', development: false });

function requestWith(headers: Record<string, string | string[]>): IncomingMessage {
	return { headers } as unknown as IncomingMessage;
}

describe('resolveAllowedOrigin', () => {
	let resolveAllowedOrigin: typeof import('./request-host.ts').resolveAllowedOrigin;
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.resetModules();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const { appLogger } = await import('../../global/app-logger.ts');
		warn = vi.spyOn(appLogger, 'warn').mockReturnThis();
		({ resolveAllowedOrigin } = await import('./request-host.ts'));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const check = (headers: Record<string, string>, trustProxy?: TrustProxy) =>
		resolveAllowedOrigin(requestWith(headers), 'http://127.0.0.1:3000', trustProxy, policy);

	it('returns the origin of an allowed host, and null for another host', () => {
		expect(check({ host: 'shop.example' })).toBe('http://shop.example');
		expect(check({ host: 'shop.example:8443' })).toBe('http://shop.example:8443');
		expect(check({ host: 'evil.example' })).toBeNull();
	});

	it('returns null for a request that names no usable host, not the listen origin', () => {
		expect(check({})).toBeNull();
		expect(check({ host: 'shop.example/evil' })).toBeNull();
	});

	it('returns the origin of the forwarded host and protocol only for a trusted proxy', () => {
		const headers = { host: 'shop.example', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' };

		expect(check(headers)).toBe('http://shop.example');
		expect(check(headers, true)).toBeNull();
		expect(
			check({ host: 'internal', 'x-forwarded-host': 'shop.example', 'x-forwarded-proto': 'https' }, true),
		).toBe('https://shop.example');
	});

	it('logs a refused host once, and names the fix', () => {
		check({ host: 'evil.example' });
		check({ host: 'evil.example' });

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain('"evil.example"');
		expect(warn.mock.calls[0]?.[0]).toContain('allowedHosts');
	});

	it('stops logging after 50 different hosts, and logs again in the next ten minute window', () => {
		for (let index = 0; index < 60; index += 1) check({ host: `host-${index}.example` });
		expect(warn).toHaveBeenCalledTimes(50);

		vi.advanceTimersByTime(10 * 60 * 1000 + 1);
		check({ host: 'internal-proxy-name' });

		expect(warn).toHaveBeenCalledTimes(51);
		expect(warn.mock.calls[50]?.[0]).toContain('"internal-proxy-name"');
	});
});

describe('isUpgradeOriginAllowed', () => {
	const allowed = (origin: string | string[] | undefined) =>
		isUpgradeOriginAllowed(requestWith(origin === undefined ? {} : { origin }), 'https://shop.example');

	it('allows the checked origin and a handshake without Origin', () => {
		expect(allowed('https://shop.example')).toBe(true);
		expect(allowed(undefined)).toBe(true);
	});

	it.each([
		['another site', 'https://evil.example'],
		['a sibling subdomain', 'https://app.shop.example'],
		['another port', 'https://shop.example:8443'],
		['another protocol', 'http://shop.example'],
		['the null origin', 'null'],
		['an empty value', ''],
		['a trailing slash', 'https://shop.example/'],
	])('refuses %s', (_label, origin) => {
		expect(allowed(origin)).toBe(false);
	});
});
