import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { APP_TEST_ROUTES_URLS, FIXTURE_APP_PROJECT_DIR } from '../../__fixtures__/constants.js';
import { ConfigBuilder } from '../config/config-builder.ts';
import { StaticContentServer } from './sc-server.ts';

const appConfig = await new ConfigBuilder().setRootDir(FIXTURE_APP_PROJECT_DIR).build();

describe('StaticContentServer', () => {
	let server: StaticContentServer;

	beforeEach(async () => {
		server = StaticContentServer.createServer({
			appConfig,
			options: {
				port: 3001,
			},
		});
	});

	afterEach(() => {
		server.stop();
	});

	test('should serve existing file', async () => {
		const req = new Request(APP_TEST_ROUTES_URLS.existingSvgFile);
		const res = await server.fetch(req);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('image/svg+xml');
	});

	test('should serve gzip file', async () => {
		const req = new Request(APP_TEST_ROUTES_URLS.existingCssFile);
		const res = await server.fetch(req);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/css');
		expect(res.headers.get('content-encoding')).toBe('gzip');
	});

	test('should return custom 404 page for non-existent file', async () => {
		const req = new Request(APP_TEST_ROUTES_URLS.nonExistentFile);
		const res = await server.fetch(req);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html');
		expect(await res.text()).toContain('<h1>404 - Page Not Found</h1>');
	});

	test('should return custom 404 page for non-existent page', async () => {
		const req = new Request(APP_TEST_ROUTES_URLS.nonExistentPage);
		const res = await server.fetch(req);

		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html');
		expect(await res.text()).toContain('<h1>404 - Page Not Found</h1>');
	});
});
