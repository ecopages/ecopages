import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { NodeStaticContentServer } from './static-content-server.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';

const TMP_DIR = path.join(os.tmpdir(), 'node-static-content-server-test');

const createAppConfig = (): EcoPagesAppConfig =>
	({
		rootDir: TMP_DIR,
		distDir: 'dist',
		absolutePaths: {
			distDir: path.join(TMP_DIR, 'dist'),
			workDir: path.join(TMP_DIR, '.eco'),
		} as EcoPagesAppConfig['absolutePaths'],
	}) as EcoPagesAppConfig;

describe('NodeStaticContentServer', () => {
	beforeEach(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
		fs.mkdirSync(path.join(TMP_DIR, 'dist', 'assets', 'pages'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	it('should serve built CSS assets with the correct content type in preview mode', async () => {
		const distDir = path.join(TMP_DIR, 'dist');
		fs.writeFileSync(
			path.join(distDir, 'api-lab.html'),
			'<html><head><link rel="stylesheet" href="/assets/pages/api-lab.css"></head><body>API Lab</body></html>',
		);
		fs.writeFileSync(path.join(distDir, 'assets', 'pages', 'api-lab.css'), '.api-lab { color: tomato; }');

		const server = new NodeStaticContentServer({
			appConfig: createAppConfig(),
			options: { hostname: '127.0.0.1', port: 0 },
		});

		const httpServer = await server.start();
		const address = httpServer.address() as AddressInfo;

		try {
			const htmlResponse = await fetch(`http://127.0.0.1:${address.port}/api-lab`);
			const cssResponse = await fetch(`http://127.0.0.1:${address.port}/assets/pages/api-lab.css`);

			expect(htmlResponse.status).toBe(200);
			expect(await htmlResponse.text()).toContain('/assets/pages/api-lab.css');
			expect(cssResponse.status).toBe(200);
			expect(cssResponse.headers.get('content-type')).toContain('text/css');
			expect(await cssResponse.text()).toContain('.api-lab { color: tomato; }');
		} finally {
			await server.stop();
		}
	});
});
