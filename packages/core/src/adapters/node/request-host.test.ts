import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHostPolicy } from '../shared/http/host-policy.ts';

const policy = createHostPolicy({ allowedHosts: undefined, baseUrl: 'https://shop.example', development: false });

function requestFor(host: string): IncomingMessage {
	return { headers: { host } } as unknown as IncomingMessage;
}

describe('isRequestHostAllowed', () => {
	let isRequestHostAllowed: typeof import('./request-host.ts').isRequestHostAllowed;
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(async () => {
		vi.resetModules();
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
		const { appLogger } = await import('../../global/app-logger.ts');
		warn = vi.spyOn(appLogger, 'warn').mockReturnThis();
		({ isRequestHostAllowed } = await import('./request-host.ts'));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	const check = (host: string) => isRequestHostAllowed(requestFor(host), 'http://127.0.0.1:3000', undefined, policy);

	it('answers true for an allowed host and without a policy, and false for another host', () => {
		expect(check('shop.example')).toBe(true);
		expect(check('evil.example')).toBe(false);
		expect(isRequestHostAllowed(requestFor('evil.example'), 'http://127.0.0.1:3000', undefined, undefined)).toBe(
			true,
		);
	});

	it('logs a refused host once, and names the fix', () => {
		check('evil.example');
		check('evil.example');

		expect(warn).toHaveBeenCalledOnce();
		expect(warn.mock.calls[0]?.[0]).toContain('"evil.example"');
		expect(warn.mock.calls[0]?.[0]).toContain('allowedHosts');
	});

	it('stops logging after 50 different hosts, and logs again in the next ten minute window', () => {
		for (let index = 0; index < 60; index += 1) check(`host-${index}.example`);
		expect(warn).toHaveBeenCalledTimes(50);

		vi.advanceTimersByTime(10 * 60 * 1000 + 1);
		check('internal-proxy-name');

		expect(warn).toHaveBeenCalledTimes(51);
		expect(warn.mock.calls[50]?.[0]).toContain('"internal-proxy-name"');
	});
});
