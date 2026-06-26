import { describe, expect, it } from 'vitest';
import { resolveEcopagesDevServerOrigin, resolveViteDevServerOrigin } from './resolve-vite-dev-origin.ts';

describe('resolveViteDevServerOrigin', () => {
	it('prefers server.origin when configured', () => {
		expect(
			resolveViteDevServerOrigin({
				server: {
					origin: 'https://preview.example.test/',
					host: '127.0.0.1',
					port: 4173,
				},
			} as never),
		).toBe('https://preview.example.test');
	});

	it('falls back to server host and port', () => {
		expect(
			resolveViteDevServerOrigin({
				server: {
					host: '127.0.0.1',
					port: 4012,
				},
			} as never),
		).toBe('http://127.0.0.1:4012');
	});

	it('normalizes ipv6 hostnames for URL construction', () => {
		expect(
			resolveViteDevServerOrigin({
				server: {
					host: '::1',
					port: 4012,
				},
			} as never),
		).toBe('http://[::1]:4012');
	});
});

describe('resolveEcopagesDevServerOrigin', () => {
	it('prefers the resolved Vite origin over config fallback', () => {
		expect(resolveEcopagesDevServerOrigin('http://localhost:4012', 'http://localhost:3000')).toBe(
			'http://localhost:4012',
		);
	});

	it('uses the config fallback when Vite origin is unavailable', () => {
		expect(resolveEcopagesDevServerOrigin(undefined, 'http://localhost:3000/')).toBe('http://localhost:3000');
	});
});
