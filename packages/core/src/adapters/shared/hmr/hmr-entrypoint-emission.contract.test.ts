import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, test, vi } from 'vitest';
import { DEV_TRANSFORM_URL_PREFIX } from '../../../dev/transform-server/dev-transform-url.ts';
import { ConfigBuilder } from '../../../config/config-builder.ts';
import { HmrManager as BunHmrManager } from '../../bun/hmr-manager.ts';
import { NodeHmrManager } from '../../node/node-hmr-manager.ts';
import type { SharedHmrManager } from './shared-hmr-manager.ts';

const tempRoots: string[] = [];

function createTempRoot(prefix: string): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
	tempRoots.push(root);
	return root;
}

afterEach(() => {
	for (const root of tempRoots.splice(0)) {
		fs.rmSync(root, { recursive: true, force: true });
	}
	vi.restoreAllMocks();
});

const runtimes = [
	{
		name: 'node',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return new NodeHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
				} as any,
			});
		},
	},
	{
		name: 'bun',
		async create(rootDir: string): Promise<SharedHmrManager> {
			const config = await new ConfigBuilder().setRootDir(rootDir).build();
			return new BunHmrManager({
				appConfig: config,
				bridge: {
					subscriberCount: 0,
					broadcast: () => {},
					subscribe: () => {},
					unsubscribe: () => {},
				} as any,
			});
		},
	},
] as const;

describe.each(runtimes)('HMR entrypoint emission: $name', ({ create }) => {
	test('registerEntrypoint returns a dev transform URL without invoking handleFileChange', async () => {
		const rootDir = createTempRoot('ecopages-hmr-emission-dispatch');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

		using manager = await create(rootDir);
		const handleFileChange = vi.spyOn(manager, 'handleFileChange');

		const outputUrl = await manager.registerEntrypoint(entrypointPath);

		assert.equal(outputUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`);
		assert.equal(handleFileChange.mock.calls.length, 0);
	});

	test('registerEntrypoint does not broadcast client events', async () => {
		const rootDir = createTempRoot('ecopages-hmr-emission-no-broadcast');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const entrypointPath = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(entrypointPath, 'export default function Page() { return null; }', 'utf8');

		using manager = await create(rootDir);
		const broadcast = vi.spyOn(manager, 'broadcast');

		await manager.registerEntrypoint(entrypointPath);

		assert.equal(broadcast.mock.calls.length, 0);
	});

	test('registers a second page after the first page is already watched', async () => {
		const rootDir = createTempRoot('ecopages-hmr-emission-second-page');
		const pagesDir = path.join(rootDir, 'src', 'pages');
		fs.mkdirSync(pagesDir, { recursive: true });

		const firstEntrypoint = path.join(pagesDir, 'about.tsx');
		const secondEntrypoint = path.join(pagesDir, 'index.tsx');
		fs.writeFileSync(firstEntrypoint, 'export default function About() { return null; }', 'utf8');
		fs.writeFileSync(secondEntrypoint, 'export default function Home() { return null; }', 'utf8');

		using manager = await create(rootDir);

		const firstUrl = await manager.registerEntrypoint(firstEntrypoint);
		const secondUrl = await manager.registerEntrypoint(secondEntrypoint);

		assert.equal(firstUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/about.js`);
		assert.equal(secondUrl, `${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`);
		assert.equal(manager.getWatchedFiles().size, 2);
	});
});
