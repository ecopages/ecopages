import { describe, expect, it } from 'vitest';
import { assertAllowedHosts, createHostPolicy } from './host-policy.ts';

function policy(input: { allowedHosts?: readonly string[] | true; baseUrl?: string; development?: boolean }) {
	return createHostPolicy({
		allowedHosts: input.allowedHosts,
		baseUrl: input.baseUrl ?? 'https://shop.example.com',
		development: input.development ?? false,
	});
}

describe('createHostPolicy', () => {
	describe('production', () => {
		it('allows the host of baseUrl, with any port, and refuses every other host', () => {
			const hosts = policy({ baseUrl: 'https://shop.example.com:8443' });

			expect(hosts.allows('shop.example.com')).toBe(true);
			expect(hosts.allows('SHOP.example.com')).toBe(true);
			expect(hosts.allows('evil.example')).toBe(false);
			expect(hosts.allows('shop.example.com.evil.example')).toBe(false);
			expect(hosts.allows('example.com')).toBe(false);
		});

		it('does not allow loopback unless baseUrl or allowedHosts names it', () => {
			const hosts = policy({});

			expect(hosts.allows('localhost')).toBe(false);
			expect(hosts.allows('127.0.0.1')).toBe(false);
			expect(hosts.allows('[::1]')).toBe(false);
			expect(policy({ baseUrl: 'http://localhost:3000' }).allows('localhost')).toBe(true);
		});

		it('adds allowedHosts to the baseUrl host and never replaces it', () => {
			const hosts = policy({ allowedHosts: ['www.example.com', 'localhost'] });

			expect(hosts.allows('www.example.com')).toBe(true);
			expect(hosts.allows('localhost')).toBe(true);
			expect(hosts.allows('shop.example.com')).toBe(true);
			expect(hosts.allows('evil.example')).toBe(false);
		});

		it('matches a wildcard against subdomains of any depth but not the bare domain', () => {
			const hosts = policy({ allowedHosts: ['*.example.com'] });

			expect(hosts.allows('shop.example.com')).toBe(true);
			expect(hosts.allows('a.b.example.com')).toBe(true);
			expect(hosts.allows('example.com')).toBe(false);
			expect(hosts.allows('notexample.com')).toBe(false);
			expect(hosts.allows('example.com.evil.example')).toBe(false);
			expect(hosts.allows('evilexample.com')).toBe(false);
		});

		it('treats a trailing dot as the same host', () => {
			const hosts = policy({ allowedHosts: ['shop.example.com', '*.example.org'] });

			expect(hosts.allows('shop.example.com.')).toBe(true);
			expect(hosts.allows('a.example.org.')).toBe(true);
		});

		it('allows every host only for allowedHosts: true', () => {
			const hosts = policy({ allowedHosts: true });

			expect(hosts.allows('evil.example')).toBe(true);
			expect(hosts.allows('anything.test')).toBe(true);
		});

		it('refuses an empty hostname', () => {
			expect(policy({}).allows('')).toBe(false);
			expect(policy({ allowedHosts: [] }).allows('shop.example.com')).toBe(true);
			expect(policy({ allowedHosts: [] }).allows('other.example.com')).toBe(false);
		});
	});

	describe('development', () => {
		it('allows localhost, its subdomains, loopback addresses and IP literals by default', () => {
			const hosts = policy({ development: true });

			expect(hosts.allows('localhost')).toBe(true);
			expect(hosts.allows('app.localhost')).toBe(true);
			expect(hosts.allows('127.0.0.1')).toBe(true);
			expect(hosts.allows('127.1.2.3')).toBe(true);
			expect(hosts.allows('[::1]')).toBe(true);
			expect(hosts.allows('192.168.1.20')).toBe(true);
		});

		it('refuses a name that merely resembles localhost', () => {
			const hosts = policy({ development: true });

			expect(hosts.allows('localhost.evil.example')).toBe(false);
			expect(hosts.allows('evil.example')).toBe(false);
			expect(hosts.allows('127.0.0.1.evil.example')).toBe(false);
			expect(hosts.allows('notlocalhost')).toBe(false);
		});

		it('also allows the baseUrl host, so a configured production URL works under dev', () => {
			expect(policy({ development: true }).allows('shop.example.com')).toBe(true);
		});

		it('adds allowedHosts to the local defaults and the baseUrl host', () => {
			const hosts = policy({ development: true, allowedHosts: ['dev.example.test'] });

			expect(hosts.allows('dev.example.test')).toBe(true);
			expect(hosts.allows('localhost')).toBe(true);
			expect(hosts.allows('shop.example.com')).toBe(true);
			expect(hosts.allows('evil.example')).toBe(false);
		});

		it('allows every host for allowedHosts: true', () => {
			expect(policy({ development: true, allowedHosts: true }).allows('evil.example')).toBe(true);
		});
	});
});

describe('allowedHosts entries are matched in the form a request host takes', () => {
	it.each([
		['127.1', '127.0.0.1'],
		['0177.0.0.1', '127.0.0.1'],
		['[0:0:0:0:0:0:0:1]', '[::1]'],
		['[::FFFF:127.0.0.1]', '[::ffff:7f00:1]'],
		['bücher.example', 'xn--bcher-kva.example'],
		['Shop.Example.COM.', 'shop.example.com'],
	])('%s matches %s', (entry, hostname) => {
		expect(policy({ allowedHosts: [entry] }).allows(hostname)).toBe(true);
	});

	it('matches a wildcard written with an internationalized domain', () => {
		expect(policy({ allowedHosts: ['*.bücher.example'] }).allows('shop.xn--bcher-kva.example')).toBe(true);
	});
});

describe('assertAllowedHosts', () => {
	it('accepts undefined, true, hostnames, IP addresses and leading wildcards', () => {
		expect(() => assertAllowedHosts(undefined)).not.toThrow();
		expect(() => assertAllowedHosts(true)).not.toThrow();
		expect(() =>
			assertAllowedHosts(['shop.example.com', '*.example.com', 'localhost', '10.0.0.4', '[::1]']),
		).not.toThrow();
	});

	it.each([
		['false', false],
		['a string', 'example.com'],
		['a number', 1],
		['a non-string entry', [1]],
		['an empty entry', ['']],
		['a bare wildcard', ['*']],
		['a wildcard in the middle', ['a.*.example.com']],
		['a wildcard with no domain', ['*.']],
		['a scheme', ['https://example.com']],
		['a port', ['example.com:3000']],
		['a path', ['example.com/path']],
		['whitespace', ['exam ple.com']],
		['a bracketed name that is not an address', ['[foo]']],
		['a wildcard on an address', ['*.127.0.0.1']],
		['credentials', ['user@example.com']],
		['a percent-encoded wildcard', ['%2a.example.com']],
		['a percent-encoded dot', ['example%2ecom']],
	])('rejects %s', (_label, value) => {
		expect(() => assertAllowedHosts(value as never)).toThrow(/allowedHosts/);
	});
});
