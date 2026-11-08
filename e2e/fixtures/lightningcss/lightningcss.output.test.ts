import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { checkClientAssetReachability } from '../../utils/client-asset-reachability.ts';

const cliPath = fileURLToPath(new URL('../../../packages/ecopages/bin/cli.js', import.meta.url));

describe('plain CSS on the Lightning CSS Processor, in a production build', () => {
	let appDir: string;
	let clientDir: string;

	beforeAll(() => {
		appDir = copyFixtureApp(import.meta.dirname);
		clientDir = path.join(appDir, 'dist', 'client');
		const built = spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
			cwd: appDir,
			env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
			encoding: 'utf8',
			timeout: 180_000,
		});
		expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
	}, 200_000);

	afterAll(() => {
		rmSync(appDir, { recursive: true, force: true });
	});

	function emittedMainStylesheet(): string {
		const html = readFileSync(path.join(clientDir, 'index.html'), 'utf8');
		const href = /<link rel="stylesheet" href="([^"]+\.css)"/.exec(html)?.[1];
		expect(href).toBeDefined();
		return readFileSync(path.join(clientDir, href!), 'utf8');
	}

	it('bundles the @import with its layer, minified, and hoists the remote one', () => {
		const css = emittedMainStylesheet();

		expect(css.startsWith("@import url('https://fonts.example.test/inter.css');")).toBe(true);
		expect(css.match(/@import/g)).toHaveLength(1);
		expect(css).toContain('@layer components{.button{');
	});

	it('lowers nesting for the targets', () => {
		const css = emittedMainStylesheet();

		expect(css).toContain('main .button{margin:0}');
		expect(css).not.toContain('&');
	});

	it('emits the file a url() of the imported partial names', () => {
		const css = emittedMainStylesheet();
		const reference = /url\(["']?([^"')]+\.png)["']?\)/.exec(css)?.[1];

		expect(reference).toMatch(/[a-f0-9]{16}\.png$/);
		expect(readdirSync(path.join(clientDir, 'assets'))).toContain(path.basename(reference!));
	});

	it('leaves no file missing for the reachability check', () => {
		expect(checkClientAssetReachability(clientDir).missing).toEqual([]);
	});
});
