import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import os from 'node:os';
import fs from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { finalizeEcoPagesConfig } from '@ecopages/core/config';
import type { IClientBridge } from '../../../../core/src/config/internal-types';
import { DevelopmentStylesheetService } from '../../../../core/src/dev/stylesheets/development-stylesheet.service';
import { LightningCssProcessorPlugin } from '../plugin';

let rootDir: string;
const write = (relativePath: string, contents: string): string => {
	const file = path.join(rootDir, relativePath);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
	return file;
};

const changed = (file: string) => ({ created: [], changed: [file], deleted: [] });
const created = (file: string) => ({ created: [file], changed: [], deleted: [] });

/** A development stylesheet service on an app with the Lightning CSS Processor, and a bridge that records what it shows. */
async function startDevelopment() {
	const processor = new LightningCssProcessorPlugin({ options: {} });
	const config = await finalizeEcoPagesConfig({ rootDir, srcDir: 'src', distDir: 'dist', processors: [processor] });
	processor.setContext(config);
	const refreshed: string[] = [];
	const errors: string[] = [];
	const bridge: IClientBridge = {
		subscriberCount: 1,
		broadcast: () => {},
		reload: () => {},
		update: () => {},
		cssUpdate: (file) => refreshed.push(file),
		error: (message) => errors.push(message),
	};
	const stylesheets = new DevelopmentStylesheetService(config);
	await stylesheets.prewarm();
	/** The development output of a source stylesheet, which core writes at its source-relative path under `assets`. */
	const outputOf = (file: string): string =>
		fs.readFileSync(
			path.join(config.absolutePaths.distDir, 'assets', path.relative(path.join(rootDir, 'src'), file)),
			'utf8',
		);
	return { stylesheets, bridge, refreshed, errors, outputOf };
}

describe('stylesheet rebuilds in development', () => {
	beforeEach(() => {
		rootDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lightningcss-development-test-')));
	});

	afterEach(() => {
		fs.rmSync(rootDir, { recursive: true, force: true });
	});

	test('editing a nested partial rebuilds its entry, and not the partial between', async () => {
		const mid = write('src/styles/mid.css', '@import "./deep.css";\n.mid { color: red; }');
		const deep = write('src/styles/deep.css', '.deep { color: red; }');
		const main = write('src/styles/main.css', '@import "./mid.css";');
		const { stylesheets, bridge, refreshed, outputOf } = await startDevelopment();

		write('src/styles/deep.css', '.deep { color: blue; }');
		const rebuilt = await stylesheets.applyChanges(changed(deep), bridge);

		expect(rebuilt).toContain(main);
		expect(refreshed).toContain(main);
		expect(refreshed).not.toContain(mid);
		expect(outputOf(main)).toContain('#00f');
	});

	test('creating the partial a stylesheet imports rebuilds the stylesheet', async () => {
		const main = write('src/styles/main.css', '@import "./later.css";\n.a { color: red; }');
		const { stylesheets, bridge, refreshed, outputOf } = await startDevelopment();

		const later = write('src/styles/later.css', '.later { color: red; }');
		const rebuilt = await stylesheets.applyChanges(created(later), bridge);

		expect(rebuilt).toContain(main);
		expect(refreshed).toContain(main);
		expect(outputOf(main)).toContain('.later');
	});

	test('a partial that breaks keeps the last good output until a save fixes it', async () => {
		const part = write('src/styles/part.css', '.part { color: red; }');
		const main = write('src/styles/main.css', '@import "./part.css";');
		const { stylesheets, bridge, refreshed, errors, outputOf } = await startDevelopment();
		const lastGood = stylesheets.version(main);

		write('src/styles/part.css', '.part { color: red; }\n}\n');
		await stylesheets.applyChanges(changed(part), bridge);

		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('part.css');
		expect(refreshed).toEqual([]);
		expect(stylesheets.version(main)).toBe(lastGood);

		write('src/styles/part.css', '.part { color: blue; }');
		const rebuilt = await stylesheets.applyChanges(changed(part), bridge);

		expect(rebuilt).toContain(main);
		expect(refreshed).toContain(main);
		expect(outputOf(main)).toContain('#00f');
	});
});
