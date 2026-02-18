import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../../internal-types.ts';
import { NodeStaticContentServer } from './static-content-server.ts';

const TMP_DIR = path.join(os.tmpdir(), 'node-static-content-server-test');

function getFreePort(): Promise<number> {
	return new Promise((resolve, reject) => {
		const tempServer = net.createServer();
		tempServer.on('error', reject);
		tempServer.listen(0, '127.0.0.1', () => {
			const addressInfo = tempServer.address();
			if (!addressInfo || typeof addressInfo === 'string') {
				tempServer.close(() => reject(new Error('Could not resolve test port')));
				return;
			}

			const selectedPort = addressInfo.port;
			tempServer.close((error) => {
				if (error) {
					reject(error);
					return;
				}

				resolve(selectedPort);
			});
		});
	});
}

function createAppConfig(distDir: string): EcoPagesAppConfig {
	return {
		absolutePaths: {
			distDir,
		},
	} as unknown as EcoPagesAppConfig;
}

describe('NodeStaticContentServer', () => {
	let server: NodeStaticContentServer | null = null;
	let port = 0;
	const hostname = '127.0.0.1';

	beforeEach(async () => {
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
		fs.mkdirSync(TMP_DIR, { recursive: true });
		port = await getFreePort();
	});

	afterEach(async () => {
		if (server) {
			await server.stop(true);
			server = null;
		}
		fs.rmSync(TMP_DIR, { recursive: true, force: true });
	});

	async function startServer(): Promise<string> {
		server = new NodeStaticContentServer({
			appConfig: createAppConfig(TMP_DIR),
			options: { hostname, port },
		});
		await server.start();
		return `http://${hostname}:${port}`;
	}

	it('serves index.html for root requests', async () => {
		fs.writeFileSync(path.join(TMP_DIR, 'index.html'), '<h1>home</h1>');
		const baseUrl = await startServer();

		const response = await fetch(`${baseUrl}/`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(await response.text()).toBe('<h1>home</h1>');
	});

	it('serves html fallback for extensionless routes', async () => {
		fs.writeFileSync(path.join(TMP_DIR, 'about.html'), '<h1>about</h1>');
		const baseUrl = await startServer();

		const response = await fetch(`${baseUrl}/about`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(await response.text()).toBe('<h1>about</h1>');
	});

	it('serves static files by extension', async () => {
		fs.mkdirSync(path.join(TMP_DIR, 'assets'), { recursive: true });
		fs.writeFileSync(path.join(TMP_DIR, 'assets', 'app.js'), 'console.log("ok")');
		const baseUrl = await startServer();

		const response = await fetch(`${baseUrl}/assets/app.js`);
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/javascript');
		expect(await response.text()).toBe('console.log("ok")');
	});

	it('serves custom 404 page when route is missing', async () => {
		fs.writeFileSync(path.join(TMP_DIR, '404.html'), '<h1>missing</h1>');
		const baseUrl = await startServer();

		const response = await fetch(`${baseUrl}/does-not-exist`);
		expect(response.status).toBe(404);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(await response.text()).toBe('<h1>missing</h1>');
	});

	it('rejects methods other than GET and HEAD', async () => {
		const baseUrl = await startServer();
		const response = await fetch(`${baseUrl}/`, { method: 'POST' });

		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET, HEAD');
	});
});
