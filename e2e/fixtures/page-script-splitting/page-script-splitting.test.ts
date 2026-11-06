import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const cliPath = path.join(repoRoot, 'packages/ecopages/bin/cli.js');
const fixtureDir = import.meta.dirname;
const MARKER = 'PSS_BIG_MARKER_';

let appDir: string;
let assetsDir: string;

function readPageScript(htmlFile: string): { name: string; source: string } {
	const html = readFileSync(path.join(appDir, 'dist/client', htmlFile), 'utf8');
	const match = html.match(/<script[^>]*src="\/assets\/([^"]+\.js)"[^>]*type="module"/);
	if (!match?.[1]) {
		throw new Error(`No Page script in ${htmlFile}`);
	}
	return { name: match[1], source: readFileSync(path.join(assetsDir, match[1]), 'utf8') };
}

function listChunksWithMarker(): string[] {
	return readdirSync(assetsDir)
		.filter((file) => file.endsWith('.js'))
		.filter((file) => readFileSync(path.join(assetsDir, file), 'utf8').includes(MARKER));
}

describe('page script splitting in production builds', () => {
	beforeAll(() => {
		appDir = copyFixtureApp(fixtureDir);
		assetsDir = path.join(appDir, 'dist/client/assets');
		const result = spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
			cwd: appDir,
			env: { ...process.env, VITEST: '', NODE_ENV: 'production' },
			encoding: 'utf8',
			timeout: 180_000,
		});
		if (result.status !== 0) {
			throw new Error(`ecopages build failed\n${result.stdout}\n${result.stderr}`);
		}
	}, 240_000);

	afterAll(() => {
		rmSync(appDir, { recursive: true, force: true });
	});

	it('emits the dynamically imported module as its own hashed file', () => {
		expect(listChunksWithMarker()).toHaveLength(1);
		expect(listChunksWithMarker()[0]).toMatch(/^big-[\w-]+\.js$/);
	});

	it.each([
		['two scripts', 'index.html'],
		['one script', 'single.html'],
	])('keeps the dynamic import out of the Page script with %s', (_label, htmlFile) => {
		const pageScript = readPageScript(htmlFile);
		const [bigChunk] = listChunksWithMarker();

		expect(pageScript.source).not.toContain(MARKER);

		const dynamicImport = new RegExp(`import\\(["'\`]\\./${bigChunk}["'\`]\\)`);
		const loaders = readdirSync(assetsDir)
			.filter((file) => file.endsWith('.js') && file !== bigChunk)
			.filter((file) => dynamicImport.test(readFileSync(path.join(assetsDir, file), 'utf8')));
		expect(loaders.length).toBeGreaterThan(0);
	});

	it('serves the two-script Page from a different Page script than the one-script Page', () => {
		expect(readPageScript('index.html').name).not.toBe(readPageScript('single.html').name);
	});
});
