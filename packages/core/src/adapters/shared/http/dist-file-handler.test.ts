import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { recordHashedBrowserAsset } from '../../../services/assets/hashed-browser-asset.ts';
import { serveDistFile } from './dist-file-handler.ts';

const tempRoots: string[] = [];

function createDist(): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecopages-dist-handler-'));
	tempRoots.push(root);
	const distDir = path.join(root, 'dist');
	fs.mkdirSync(distDir, { recursive: true });
	return distDir;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

describe('serveDistFile', () => {
	it('serves an exported page by its extensionless route and directory index', async () => {
		const distDir = createDist();
		fs.mkdirSync(path.join(distDir, 'release.notes'), { recursive: true });
		fs.writeFileSync(path.join(distDir, 'release.notes', 'index.html'), '<h1>Notes</h1>');
		fs.writeFileSync(path.join(distDir, 'privacy.html'), '<h1>Privacy</h1>');

		const privacy = await serveDistFile(new Request('http://localhost/privacy'), {
			distDir,
			watchMode: false,
			resolveExportedPages: true,
		});
		const notes = await serveDistFile(new Request('http://localhost/release.notes'), {
			distDir,
			watchMode: false,
			resolveExportedPages: true,
		});

		expect([privacy.status, await privacy.text()]).toEqual([200, '<h1>Privacy</h1>']);
		expect([notes.status, await notes.text()]).toEqual([200, '<h1>Notes</h1>']);
	});

	it('negotiates gzip and conditional responses with the shared file cache policy', async () => {
		const distDir = createDist();
		const source = Buffer.from('export const page = true;');
		const assetPath = path.join(distDir, 'assets', 'site-navigation.js');
		fs.mkdirSync(path.dirname(assetPath), { recursive: true });
		fs.writeFileSync(assetPath, source);
		fs.writeFileSync(`${assetPath}.gz`, gzipSync(source));
		const hashedPath = path.join(distDir, 'assets', 'pages__home-DlXqs-Dv.js');
		fs.writeFileSync(hashedPath, source);
		recordHashedBrowserAsset(hashedPath);

		const plain = await serveDistFile(new Request('http://localhost/assets/site-navigation.js'), {
			distDir,
			watchMode: false,
		});
		const compressed = await serveDistFile(
			new Request('http://localhost/assets/site-navigation.js', { headers: { 'Accept-Encoding': 'gzip' } }),
			{ distDir, watchMode: false },
		);
		const gzipExcluded = await serveDistFile(
			new Request('http://localhost/assets/site-navigation.js', {
				headers: { 'Accept-Encoding': 'gzip;q=0, *;q=1' },
			}),
			{ distDir, watchMode: false },
		);
		const notModified = await serveDistFile(
			new Request('http://localhost/assets/site-navigation.js', {
				headers: { 'Accept-Encoding': 'gzip', 'If-None-Match': compressed.headers.get('etag') ?? '' },
			}),
			{ distDir, watchMode: false },
		);
		const hashed = await serveDistFile(new Request('http://localhost/assets/pages__home-DlXqs-Dv.js'), {
			distDir,
			watchMode: false,
		});

		expect(await plain.text()).toBe(source.toString());
		expect(plain.headers.get('content-encoding')).toBeNull();
		expect(compressed.headers.get('content-encoding')).toBe('gzip');
		expect(compressed.headers.get('vary')).toBe('Accept-Encoding');
		expect(compressed.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
		expect(gzipExcluded.headers.get('content-encoding')).toBeNull();
		expect(gzipExcluded.headers.get('vary')).toBe('Accept-Encoding');
		expect(notModified.status).toBe(304);
		expect(notModified.headers.get('content-encoding')).toBe('gzip');
		expect(hashed.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
	});

	it('keeps watch-mode files uncached and does not send their gzip variants', async () => {
		const distDir = createDist();
		const assetPath = path.join(distDir, 'assets', 'app.css');
		fs.mkdirSync(path.dirname(assetPath), { recursive: true });
		fs.writeFileSync(assetPath, 'body { color: tomato; }');
		fs.writeFileSync(`${assetPath}.gz`, gzipSync('body { color: tomato; }'));

		const response = await serveDistFile(
			new Request('http://localhost/assets/app.css', { headers: { 'Accept-Encoding': 'gzip' } }),
			{ distDir, watchMode: true },
		);

		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('content-encoding')).toBeNull();
		expect(response.headers.get('vary')).toBeNull();
	});

	it('revalidates HTML even when the build recorded its path as hashed', async () => {
		const distDir = createDist();
		const htmlPath = path.join(distDir, 'privacy.html');
		fs.writeFileSync(htmlPath, '<h1>Privacy</h1>');
		recordHashedBrowserAsset(htmlPath);

		const response = await serveDistFile(new Request('http://localhost/privacy.html'), {
			distDir,
			watchMode: false,
		});
		const notModified = await serveDistFile(
			new Request('http://localhost/privacy.html', {
				headers: { 'If-None-Match': response.headers.get('etag') ?? '' },
			}),
			{ distDir, watchMode: false },
		);

		expect(response.headers.get('cache-control')).toBe('public, max-age=0, must-revalidate');
		expect(response.headers.get('cache-control')).not.toContain('immutable');
		expect(notModified.status).toBe(304);
	});

	it('returns a bodyless HEAD response with the GET representation headers', async () => {
		const distDir = createDist();
		fs.writeFileSync(path.join(distDir, 'index.html'), '<h1>Home</h1>');

		const response = await serveDistFile(new Request('http://localhost/', { method: 'HEAD' }), {
			distDir,
			watchMode: false,
			resolveExportedPages: true,
		});

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/html');
		expect(await response.text()).toBe('');
	});

	it('rejects unsupported methods before looking up the file', async () => {
		const distDir = createDist();
		const response = await serveDistFile(new Request('http://localhost/assets/app.js', { method: 'POST' }), {
			distDir,
			watchMode: false,
		});

		expect(response.status).toBe(405);
		expect(response.headers.get('allow')).toBe('GET, HEAD');
	});

	it('rejects malformed encodings and traversal outside the output directory', async () => {
		const distDir = createDist();
		const malformed = await serveDistFile(new Request('http://localhost/%E0%A4%A.js'), {
			distDir,
			watchMode: false,
		});
		const traversal = await serveDistFile(new Request('http://localhost/%2e%2e%2fsecret.txt'), {
			distDir,
			watchMode: false,
		});

		expect(malformed.status).toBe(400);
		expect(traversal.status).toBe(400);
	});

	it('uses an exported 404 page in preview mode and hides internal build metadata', async () => {
		const distDir = createDist();
		fs.writeFileSync(path.join(distDir, '404.html'), '<h1>Missing</h1>');
		fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });
		fs.writeFileSync(path.join(distDir, 'assets', '.ecopages-hashed-assets'), 'internal');

		const missing = await serveDistFile(new Request('http://localhost/missing'), {
			distDir,
			watchMode: false,
			resolveExportedPages: true,
		});
		const metadata = await serveDistFile(new Request('http://localhost/assets/.ecopages-hashed-assets'), {
			distDir,
			watchMode: false,
		});

		expect([missing.status, await missing.text()]).toEqual([404, '<h1>Missing</h1>']);
		expect(metadata.status).toBe(404);
	});

	it('lets the runtime route handler provide its rendered 404', async () => {
		const distDir = createDist();
		const notFound = async () => new Response('<h1>Rendered 404</h1>', {
			status: 404,
			headers: { 'Content-Type': 'text/html' },
		});
		const response = await serveDistFile(new Request('http://localhost/missing'), {
			distDir,
			watchMode: true,
			staticFilesOnly: true,
			notFound,
		});
		const methodNotAllowed = await serveDistFile(new Request('http://localhost/missing', { method: 'POST' }), {
			distDir,
			watchMode: true,
			staticFilesOnly: true,
			notFound,
		});
		const headNotFound = await serveDistFile(new Request('http://localhost/missing.css', { method: 'HEAD' }), {
			distDir,
			watchMode: true,
			staticFilesOnly: true,
			notFound,
		});

		assert.equal(response.status, 404);
		expect(await response.text()).toBe('<h1>Rendered 404</h1>');
		expect(methodNotAllowed.status).toBe(405);
		expect(headNotFound.status).toBe(404);
		expect(await headNotFound.text()).toBe('');
	});
});
