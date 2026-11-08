import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { checkClientAssetReachability } from '../../utils/client-asset-reachability.ts';
import { WORKER_PAGES } from './worker-reply.ts';

const distDir = path.join(import.meta.dirname, 'dist-web-workers-start-e2e');
const clientDir = path.join(distDir, 'client');

function listClientScripts(): string[] {
	return readdirSync(clientDir, { withFileTypes: true, recursive: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
		.map((entry) => path.join(entry.parentPath, entry.name));
}

test.describe('A built app with a module worker', () => {
	test('writes the worker as its own client file', () => {
		const workerFiles = listClientScripts().filter((file) => readFileSync(file, 'utf8').includes('from worker'));

		expect(workerFiles.map((file) => path.basename(file))).toEqual([
			expect.stringMatching(/^echo\.worker-[\w-]+\.js$/),
		]);
	});

	test('leaves no TypeScript Worker URL in the client output', () => {
		const scriptsWithSourceUrl = listClientScripts().filter((file) =>
			/new URL\(\s*["'`][^"'`]*\.tsx?["'`]/.test(readFileSync(file, 'utf8')),
		);

		expect(scriptsWithSourceUrl).toEqual([]);
	});

	test('records the worker file in the processed-asset ledger', () => {
		const ledger = readFileSync(path.join(distDir, 'server', 'processed-assets.json'), 'utf8');

		expect(ledger).toMatch(/echo\.worker-[\w-]+\.js/);
	});

	test('writes every file a served Page references, and no other browser asset', async ({ request }) => {
		const servedHtml: string[] = [];
		for (const pathname of WORKER_PAGES) {
			servedHtml.push(await (await request.get(pathname)).text());
		}

		expect(checkClientAssetReachability(clientDir, servedHtml)).toEqual({ unreachable: [], missing: [] });
	});
});
