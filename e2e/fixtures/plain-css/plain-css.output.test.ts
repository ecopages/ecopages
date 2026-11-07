import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { checkClientAssetReachability } from '../../utils/client-asset-reachability.ts';

const cliPath = fileURLToPath(new URL('../../../packages/ecopages/bin/cli.js', import.meta.url));

describe('plain CSS with no stylesheet Processor, in a production build', () => {
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

	it('inlines the rules of a relative @import', () => {
		const css = emittedMainStylesheet();

		expect(css).not.toContain('@import');
		expect(css).toContain('.button');
		expect(css).toContain('rgb(0, 0, 128)');
	});

	it('emits the file a url() of the imported partial names', () => {
		const css = emittedMainStylesheet();
		const reference = /url\(["']?([^"')]+)["']?\)/.exec(css)?.[1];

		expect(reference).toMatch(/[a-f0-9]{16}\.png$/);
		expect(readdirSync(path.join(clientDir, 'assets'))).toContain(path.basename(reference!));
	});

	it('leaves no file missing for the reachability check', () => {
		expect(checkClientAssetReachability(clientDir).missing).toEqual([]);
	});
});
