import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyFixtureApp } from '../../../packages/core/__fixtures__/app/copy-fixture-app.ts';
import { checkClientAssetReachability } from '../../utils/client-asset-reachability.ts';

const cliPath = fileURLToPath(new URL('../../../packages/ecopages/bin/cli.js', import.meta.url));
const TEST_IDS = ['eco-jsx-badge', 'react-button', 'kit-button', 'kit-lib-eco', 'kit-lib-react'] as const;

function build(appDir: string, env: Record<string, string> = {}) {
	return spawnSync(process.execPath, [cliPath, 'build', '--runtime', 'node'], {
		cwd: appDir,
		env: { ...process.env, VITEST: '', NODE_ENV: 'production', ...env },
		encoding: 'utf8',
		timeout: 240_000,
	});
}

/** The `class` attribute of the element with `data-testid` in `html`. */
function classOf(html: string, testId: string): string {
	const tag = new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0];
	const value = /\sclass="([^"]*)"/.exec(tag ?? '')?.[1];
	expect(value, `${testId} has no class in the Page`).toBeDefined();
	return value!;
}

function readClient(appDir: string, file: string): string {
	return readFileSync(path.join(appDir, 'dist', 'client', file), 'utf8');
}

describe('CSS Modules in a production build', () => {
	const copies: string[] = [];
	let appDir: string;
	let html: string;
	let litHtml: string;

	beforeAll(() => {
		appDir = copyFixtureApp(import.meta.dirname);
		copies.push(appDir);
		const built = build(appDir);
		expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
		html = readClient(appDir, 'index.html');
		litHtml = readClient(appDir, 'lit.html');
	}, 300_000);

	afterAll(() => {
		for (const copy of copies) rmSync(copy, { recursive: true, force: true });
	});

	it('links a stylesheet that defines the scoped class names the Page uses', () => {
		const hrefs = [...html.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)].map((match) => match[1]!);
		const css = hrefs.map((href) => readClient(appDir, href)).join('\n');

		const lit = readClient(appDir, 'lit.html');
		const litCss = [...lit.matchAll(/<link rel="stylesheet" href="([^"]+\.css)"/g)]
			.map((match) => readClient(appDir, match[1]!))
			.join('\n');

		for (const testId of TEST_IDS) {
			for (const name of classOf(html, testId).split(' ')) {
				expect(css, `${testId}: no rule for .${name}`).toContain(`.${name}`);
			}
		}
		expect(litCss).toContain(`.${classOf(lit, 'lit-card-host')}`);
	});

	it('gives the browser the class names the server rendered', () => {
		const scripts = readdirSync(path.join(appDir, 'dist', 'client'), { recursive: true, encoding: 'utf8' })
			.filter((file) => file.endsWith('.js'))
			.map((file) => readClient(appDir, file))
			.join('\n');

		for (const [page, testId] of [
			[html, 'react-button'],
			[html, 'kit-button'],
			[html, 'kit-lib-react'],
			[litHtml, 'lit-card-host'],
		] as const) {
			const [own] = classOf(page, testId).split(' ');
			expect(scripts, `${testId}: the browser bundles lack ${own}`).toContain(own);
		}
	});

	it('leaves no file missing for the reachability check', () => {
		expect(checkClientAssetReachability(path.join(appDir, 'dist', 'client')).missing).toEqual([]);
	});

	it('gives the same class names when the app is built from another folder', () => {
		const other = copyFixtureApp(import.meta.dirname);
		copies.push(other);
		const built = build(other);
		expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);

		expect(other).not.toBe(appDir);
		for (const testId of TEST_IDS) {
			expect(classOf(readClient(other, 'index.html'), testId)).toBe(classOf(html, testId));
		}
		expect(classOf(readClient(other, 'lit.html'), 'lit-card-host')).toBe(classOf(litHtml, 'lit-card-host'));
	}, 300_000);

	it('fails the build, naming the component, the import and the package to install, with no Processor', () => {
		const bare = copyFixtureApp(import.meta.dirname);
		copies.push(bare);
		const built = build(bare, { ECOPAGES_CONFIG_FILE: 'eco.config.no-processor.ts' });
		const output = `${built.stdout}\n${built.stderr}`;

		expect(built.status).not.toBe(0);
		expect(output).toContain('badge.eco.tsx');
		expect(output).toContain('"./badge.module.css"');
		expect(output).toContain('@ecopages/lightningcss-processor');
	}, 300_000);
});
