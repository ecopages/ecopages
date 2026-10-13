import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import type { AddressInfo } from 'node:net';
import { NodeStaticContentServer } from './static-content-server.ts';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { recordHashedBrowserAsset } from '../../services/assets/hashed-browser-asset.ts';
import { FileSystemServerResponseFactory } from '../shared/http/fs-server-response-factory.ts';

let tmpDir: string;

const createAppConfig = (): EcoPagesAppConfig =>
	({
		rootDir: tmpDir,
		distDir: 'dist',
		absolutePaths: {
			distDir: path.join(tmpDir, 'dist'),
			workDir: path.join(tmpDir, '.eco'),
		} as EcoPagesAppConfig['absolutePaths'],
	}) as EcoPagesAppConfig;

describe('NodeStaticContentServer', () => {
	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-static-content-server-test-'));
		fs.mkdirSync(path.join(tmpDir, 'dist', 'assets', 'pages'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('should serve built CSS assets with the correct content type in preview mode', async () => {
		const distDir = path.join(tmpDir, 'dist');
		fs.writeFileSync(
			path.join(distDir, 'api-lab.html'),
			'<html><head><link rel="stylesheet" href="/assets/pages/api-lab.css"></head><body>API Lab</body></html>',
		);
		fs.writeFileSync(path.join(distDir, 'assets', 'pages', 'api-lab.css'), '.api-lab { color: tomato; }');

		await using server = new NodeStaticContentServer({
			appConfig: createAppConfig(),
			options: { hostname: '127.0.0.1', port: 0 },
		});

		const httpServer = await server.start();
		const address = httpServer.address() as AddressInfo;

		const htmlResponse = await fetch(`http://127.0.0.1:${address.port}/api-lab`);
		const cssResponse = await fetch(`http://127.0.0.1:${address.port}/assets/pages/api-lab.css`);

		expect(htmlResponse.status).toBe(200);
		expect(await htmlResponse.text()).toContain('/assets/pages/api-lab.css');
		expect(cssResponse.status).toBe(200);
		expect(cssResponse.headers.get('content-type')).toContain('text/css');
		expect(await cssResponse.text()).toContain('.api-lab { color: tomato; }');
	});

	it('serves a dotted route from its exported .html file or index.html', async () => {
		const distDir = path.join(tmpDir, 'dist');
		fs.writeFileSync(path.join(distDir, 'v1.2.html'), 'Release 1.2');
		fs.mkdirSync(path.join(distDir, 'release.notes'));
		fs.writeFileSync(path.join(distDir, 'release.notes', 'index.html'), 'Release notes');

		await using server = new NodeStaticContentServer({
			appConfig: createAppConfig(),
			options: { hostname: '127.0.0.1', port: 0 },
		});
		const { port } = (await server.start()).address() as AddressInfo;

		const version = await fetch(`http://127.0.0.1:${port}/v1.2`);
		const notes = await fetch(`http://127.0.0.1:${port}/release.notes`);

		expect([version.status, await version.text()]).toEqual([200, 'Release 1.2']);
		expect([notes.status, await notes.text()]).toEqual([200, 'Release notes']);
		expect((await fetch(`http://127.0.0.1:${port}/v9.9`)).status).toBe(404);
	});

	it('revalidates exported HTML and keeps immutable for hashed assets', async () => {
		const distDir = path.join(tmpDir, 'dist');
		fs.writeFileSync(path.join(distDir, 'index.html'), '<html>preview</html>');
		const hashedAssetPath = path.join(distDir, 'assets', 'pages', 'pages__docs__index-DlXqs-Dv.js');
		fs.writeFileSync(hashedAssetPath, 'export const page = true;');
		recordHashedBrowserAsset(hashedAssetPath);
		const privacyPagePath = path.join(distDir, 'privacy-statement.html');
		fs.writeFileSync(privacyPagePath, '<html>privacy</html>');
		recordHashedBrowserAsset(privacyPagePath);
		fs.writeFileSync(path.join(distDir, 'assets', 'pages', 'api-lab.css'), '.api-lab { color: tomato; }');

		await using server = new NodeStaticContentServer({
			appConfig: createAppConfig(),
			options: { hostname: '127.0.0.1', port: 0 },
		});
		const { port } = (await server.start()).address() as AddressInfo;

		const htmlResponse = await fetch(`http://127.0.0.1:${port}/privacy-statement`);
		expect(htmlResponse.status).toBe(200);
		expect(htmlResponse.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
		expect(htmlResponse.headers.get('cache-control')).not.toContain('immutable');
		expect(htmlResponse.headers.get('etag')).toMatch(/^"[a-f0-9]{16}"$/);

		const notModified = await fetch(`http://127.0.0.1:${port}/privacy-statement`, {
			headers: { 'If-None-Match': htmlResponse.headers.get('etag') ?? '' },
		});
		expect(notModified.status).toBe(304);

		const hashed = await fetch(`http://127.0.0.1:${port}/assets/pages/pages__docs__index-DlXqs-Dv.js`);
		expect(hashed.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');

		const unhashed = await fetch(`http://127.0.0.1:${port}/assets/pages/api-lab.css`);
		expect(unhashed.headers.get('cache-control')).toBeNull();
	});

	it('uses the same cache, ETag, and gzip policy as the runtime file server', async () => {
		const filePath = path.join(tmpDir, 'dist', 'assets', 'pages', 'site-navigation.js');
		const fileBytes = Buffer.from('export const navigation = true;');
		fs.writeFileSync(filePath, fileBytes);
		fs.writeFileSync(`${filePath}.gz`, gzipSync(fileBytes));
		const runtimeFactory = new FileSystemServerResponseFactory({ options: { watchMode: false } });
		const runtimeResponse = await runtimeFactory.createFileResponse(filePath, 'text/javascript', {
			acceptEncoding: 'gzip',
		});
		if (!runtimeResponse) throw new Error('Expected runtime file response');

		await using server = new NodeStaticContentServer({
			appConfig: createAppConfig(),
			options: { hostname: '127.0.0.1', port: 0 },
		});
		const { port } = (await server.start()).address() as AddressInfo;
		const previewResponse = await fetch(`http://127.0.0.1:${port}/assets/pages/site-navigation.js`, {
			headers: { 'Accept-Encoding': 'gzip' },
		});

		expect(previewResponse.headers.get('cache-control')).toBe(runtimeResponse.headers.get('cache-control'));
		expect(previewResponse.headers.get('etag')).toBe(runtimeResponse.headers.get('etag'));
		expect(previewResponse.headers.get('content-encoding')).toBe(runtimeResponse.headers.get('content-encoding'));

		const etag = runtimeResponse.headers.get('etag') ?? '';
		const runtimeNotModified = await runtimeFactory.createFileResponse(filePath, 'text/javascript', {
			acceptEncoding: 'gzip',
			ifNoneMatch: etag,
		});
		const previewNotModified = await fetch(`http://127.0.0.1:${port}/assets/pages/site-navigation.js`, {
			headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': etag },
		});

		expect(runtimeNotModified?.status).toBe(304);
		expect(previewNotModified.status).toBe(304);
		expect(previewNotModified.headers.get('content-encoding')).toBe('gzip');
	});
});
