import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
	createServerBundleLoaderSource,
	getProductionServerBundleDir,
	runWithProductionServerBundleDir,
	SERVER_BUNDLE_CONTEXT_KEY,
} from './server-bundle-context.ts';

describe('server-bundle-context', () => {
	const tempDirs: string[] = [];
	const bundleDirKey = Symbol.for(SERVER_BUNDLE_CONTEXT_KEY);
	const capturesKey = Symbol.for('@ecopages/test-server-bundle-contexts');

	afterEach(() => {
		Reflect.deleteProperty(globalThis, bundleDirKey);
		Reflect.deleteProperty(globalThis, capturesKey);
		for (const tempDir of tempDirs.splice(0)) {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});

	it('keeps the loader context inside its async scope', async () => {
		const appBundleDir = '/app/dist/.server';
		const scopedResult = runWithProductionServerBundleDir(appBundleDir, async () => {
			expect(getProductionServerBundleDir()).toBe(appBundleDir);
			await new Promise((resolve) => setTimeout(resolve, 1));
			return getProductionServerBundleDir();
		});

		expect(getProductionServerBundleDir()).toBeUndefined();
		await expect(scopedResult).resolves.toBe(appBundleDir);
		expect(getProductionServerBundleDir()).toBeUndefined();
	});

	it('keeps concurrent loader imports in their own bundle contexts', async () => {
		const rootDir = mkdtempSync(path.join(tmpdir(), 'eco-server-bundle-context-'));
		tempDirs.push(rootDir);
		const serverDirs = ['first', 'second'].map((name) => {
			const serverDir = path.join(rootDir, name, '.server');
			mkdirSync(serverDir, { recursive: true });
			writeFileSync(path.join(serverDir, 'app.mjs'), createServerBundleLoaderSource());
			writeFileSync(
				path.join(serverDir, 'app.bundle.mjs'),
				[
					'await new Promise((resolve) => setTimeout(resolve, 30));',
					`const contextKey = Symbol.for(${JSON.stringify(SERVER_BUNDLE_CONTEXT_KEY)});`,
					`const capturesKey = Symbol.for(${JSON.stringify('@ecopages/test-server-bundle-contexts')});`,
					'const captures = Reflect.get(globalThis, capturesKey) ?? [];',
					'captures.push(Reflect.get(globalThis, contextKey).getStore());',
					'Reflect.set(globalThis, capturesKey, captures);',
					'',
				].join('\n'),
			);
			return serverDir;
		});

		const imports = serverDirs.map(
			(serverDir) => import(/* @vite-ignore */ pathToFileURL(path.join(serverDir, 'app.mjs')).href),
		);
		expect(getProductionServerBundleDir()).toBeUndefined();
		await Promise.all(imports);

		const captures = Reflect.get(globalThis, capturesKey) as unknown[];
		expect(captures.map((capture) => path.resolve(capture as string)).sort()).toEqual(
			serverDirs.map((serverDir) => path.resolve(serverDir)).sort(),
		);
		expect(getProductionServerBundleDir()).toBeUndefined();
	});
});
