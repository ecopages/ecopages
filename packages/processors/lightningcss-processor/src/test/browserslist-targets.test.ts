import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import { LightningCssProcessorPlugin, type LightningCssOptions } from '../plugin';

const NESTED = '.card { & .title { margin: 0; } }';

let rootDir: string;

async function lower(options?: LightningCssOptions): Promise<string> {
	const plugin = new LightningCssProcessorPlugin({ options: { minify: true, ...options } });
	plugin.setContext(await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist' }));
	return (await plugin.transformStylesheet(NESTED, path.join(rootDir, 'src', 'card.css'))).css;
}

describe('browserslist targets', () => {
	beforeEach(() => {
		rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-browserslist-test-')));
		fs.mkdirSync(path.join(rootDir, 'src'), { recursive: true });
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	test('lowers for the .browserslistrc of the app when targets is unset', async () => {
		fs.writeFileSync(path.join(rootDir, '.browserslistrc'), 'chrome 80\n');

		expect(await lower()).toContain('.card .title');
	});

	test('lowers for the browserslist field of package.json when targets is unset', async () => {
		fs.writeFileSync(path.join(rootDir, 'package.json'), JSON.stringify({ browserslist: ['chrome 80'] }));

		expect(await lower()).toContain('.card .title');
	});

	test('keeps the output unlowered without a config', async () => {
		expect(await lower()).toContain('&');
	});

	test('lets an explicit targets override the config', async () => {
		fs.writeFileSync(path.join(rootDir, '.browserslistrc'), 'chrome 80\n');

		expect(await lower({ targets: ['chrome 130'] })).toContain('&');
	});

	test('lowers for explicit targets over a modern config', async () => {
		fs.writeFileSync(path.join(rootDir, '.browserslistrc'), 'chrome 130\n');

		expect(await lower({ targets: ['chrome 80'] })).toContain('.card .title');
	});

	test('keeps lowering off with targets: false even when a config exists', async () => {
		fs.writeFileSync(path.join(rootDir, '.browserslistrc'), 'chrome 80\n');

		expect(await lower({ targets: false })).toContain('&');
	});
});
