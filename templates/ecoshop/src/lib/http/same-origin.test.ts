import { describe, expect, it } from 'vitest';
import { isSameOriginRequest } from './same-origin';

const request = (origin?: string) =>
	new Request('http://127.0.0.1:3000/api/cart', { method: 'POST', headers: origin ? { Origin: origin } : {} });

describe('isSameOriginRequest', () => {
	it.each([
		['no Origin, as from an agent or curl', undefined, true],
		['the request URL origin', 'http://127.0.0.1:3000', true],
		['the trusted site origin behind a proxy', 'https://shop.example', true],
		['another site', 'https://evil.test', false],
		['a sibling port', 'http://127.0.0.1:4000', false],
	])('%s', (_label, origin, allowed) => {
		expect(isSameOriginRequest(request(origin), 'https://shop.example')).toBe(allowed);
	});
});
