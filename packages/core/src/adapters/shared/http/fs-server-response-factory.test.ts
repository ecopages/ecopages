import { describe, expect, it } from 'vitest';
import { STATUS_MESSAGE } from '../../../config/constants.ts';
import { FileSystemServerResponseFactory } from './fs-server-response-factory.ts';

describe('FileSystemServerResponseFactory', () => {
	const factory = new FileSystemServerResponseFactory();

	it('creates a response with the given route renderer body', async () => {
		const response = await factory.createResponseWithBody('<html><body>Test</body></html>');

		expect(await response.text()).toBe('<html><body>Test</body></html>');
		expect(response.headers.get('Content-Type')).toBe('text/html');
	});

	it.each([404, 500] as const)('creates an html %i response from a rendered body', async (status) => {
		const response = await factory.createHtmlErrorResponse(status, `<h1>${status}</h1>`);

		expect(await response.text()).toContain(`<h1>${status}</h1>`);
		expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
		expect(response.status).toBe(status);
		expect(response.statusText).toBe(STATUS_MESSAGE[status]);
	});

	it('keeps an unknown error status on the response envelope', async () => {
		const response = await factory.createHtmlErrorResponse(502, '<h1>Bad Gateway</h1>');

		expect(response.status).toBe(502);
		expect(response.statusText).toBe('502');
	});
});
