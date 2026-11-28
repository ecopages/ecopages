import fs from 'node:fs';
import { type AddressInfo, connect } from 'node:net';
import os from 'node:os';
import { path } from '@ecopages/file-system/path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { NodeHttpRequestBridge } from './http-request-bridge.ts';
import { NodeRuntimeHost } from './runtime-host.ts';
import { NodeServerAdapter } from './server-adapter.ts';

/**
 * Every server entry point of the adapter, started for real, answers a request for a foreign host with HTTP 400:
 * the production server (HTTP and WebSocket upgrades) and `ecopages preview`. The development server's HTTP and HMR
 * upgrade are covered by the template e2e, which runs `ecopages dev`.
 */

const BASE_URL = 'https://shop.example';

/** The first line of the answer to raw `request`, sent to `port` on loopback. */
function firstLine(port: number, request: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const socket = connect({ host: '127.0.0.1', port }, () => socket.write(request));
		let answer = '';
		socket.on('data', (chunk) => {
			answer += chunk.toString();
			if (!answer.includes('\r\n')) return;
			resolve(answer.split('\r\n')[0] ?? '');
			socket.destroy();
		});
		socket.on('error', reject);
	});
}

const get = (port: number, host: string, forwardedHost?: string) =>
	firstLine(
		port,
		`GET /about HTTP/1.1\r\nHost: ${host}\r\n${forwardedHost ? `X-Forwarded-Host: ${forwardedHost}\r\n` : ''}Connection: close\r\n\r\n`,
	);

const upgrade = (port: number, host: string, origin?: string) =>
	firstLine(
		port,
		`GET /ws HTTP/1.1\r\nHost: ${host}\r\n${origin ? `Origin: ${origin}\r\n` : ''}Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`,
	);

async function createAdapter(watch: boolean, allowedHosts?: string[], trustProxy?: { host: true }) {
	const rootDir = path.fromNative(fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-host-policy-')));
	onTestFinished(() => fs.rmSync(rootDir, { recursive: true, force: true }));
	const appConfig = await finalizeEcoPagesConfig({
		rootDir,
		integrations: [],
		baseUrl: BASE_URL,
		allowedHosts,
		trustProxy,
	});
	fs.mkdirSync(appConfig.absolutePaths.distDir, { recursive: true });
	fs.writeFileSync(path.join(appConfig.absolutePaths.distDir, 'about.html'), '<h1>About</h1>');
	const runtimeHost = new NodeRuntimeHost(new NodeHttpRequestBridge());
	const adapter = new NodeServerAdapter({
		appConfig,
		runtime: requireAppRuntime(appConfig),
		runtimeHost,
		serveOptions: { hostname: '127.0.0.1', port: 0 },
		options: { watch },
		websocketHandlers: new Map([['/ws', {}]]),
		runtimeAssetSetup: 'none',
	});
	onTestFinished(() => adapter.dispose());
	return { adapter, runtimeHost };
}

describe('NodeServerAdapter host policy', () => {
	it('answers a foreign host with 400 over HTTP and over a WebSocket upgrade under production', async () => {
		const { adapter, runtimeHost } = await createAdapter(false, ['www.shop.example']);
		const server = await runtimeHost.start({
			...adapter.getServerOptions(),
			port: 0,
			handleRequest: async () => new Response('ok'),
		});
		onTestFinished(() => runtimeHost.stop(server));
		const { port } = server.address() as AddressInfo;
		adapter.applyBoundPort({ port, runtimeOrigin: `http://127.0.0.1:${port}` });
		await adapter.completeInitialization(server);

		expect(await get(port, 'evil.example')).toMatch(/ 400 /u);
		expect(await get(port, '127.0.0.1')).toMatch(/ 400 /u);
		expect(await get(port, 'localhost')).toMatch(/ 400 /u);
		expect(await get(port, 'shop.example')).toMatch(/ 200 /u);
		expect(await get(port, 'www.shop.example')).toMatch(/ 200 /u);

		expect(await upgrade(port, 'evil.example')).toMatch(/ 400 /u);
		expect(await upgrade(port, '127.0.0.1')).toMatch(/ 400 /u);
		expect(await upgrade(port, 'shop.example', 'http://evil.example')).toMatch(/ 403 /u);
		expect(await upgrade(port, 'shop.example', 'http://shop.example')).not.toMatch(/ 40[03] /u);
	});

	it('allows the local defaults, and not a foreign host, under development', async () => {
		const { adapter } = await createAdapter(true);
		const { hostPolicy } = adapter.getServerOptions();

		expect(hostPolicy.allows('localhost')).toBe(true);
		expect(hostPolicy.allows('127.0.0.1')).toBe(true);
		expect(hostPolicy.allows('shop.example')).toBe(true);
		expect(hostPolicy.allows('evil.example')).toBe(false);
	});

	it('answers a foreign host with 400 under ecopages preview, which also allows the local defaults', async () => {
		const { adapter } = await createAdapter(false);
		const origin = await adapter.servePreviewOnly();
		if (!origin) throw new Error('Expected a preview origin');
		const { port } = new URL(origin);

		expect(await get(Number(port), 'evil.example')).toMatch(/ 400 /u);
		expect(await get(Number(port), 'evil.example:3000')).toMatch(/ 400 /u);
		expect(await get(Number(port), 'localhost')).toMatch(/ 200 /u);
		expect(await get(Number(port), '127.0.0.1')).toMatch(/ 200 /u);
		expect(await get(Number(port), 'shop.example')).toMatch(/ 200 /u);
	});

	it('checks the forwarded host under ecopages preview when the config trusts its proxy', async () => {
		const { adapter } = await createAdapter(false, undefined, { host: true });
		const origin = await adapter.servePreviewOnly();
		if (!origin) throw new Error('Expected a preview origin');
		const port = Number(new URL(origin).port);

		expect(await get(port, 'evil.example', 'shop.example')).toMatch(/ 200 /u);
		expect(await get(port, 'shop.example', 'evil.example')).toMatch(/ 400 /u);
	});
});
