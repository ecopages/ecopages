import fs from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { path } from '@ecopages/file-system/path';
import { createRecordingBridge, DevelopmentStylesheetService } from '@ecopages/core/processor/contract';
import { createTailwindApp, removeTailwindApps } from './tailwind-app.ts';

afterEach(removeTailwindApps);

const changed = (file: string) => ({ created: [], changed: [file], deleted: [] });
const created = (file: string) => ({ created: [file], changed: [], deleted: [] });

/** A development stylesheet service on a Tailwind app, and a bridge that records what it shows. */
async function startDevelopment(app: Awaited<ReturnType<typeof createTailwindApp>>) {
	const { bridge, refreshed, errors } = createRecordingBridge();
	const stylesheets = new DevelopmentStylesheetService(app.config);
	await stylesheets.prewarm();
	/** The development output of a source stylesheet, which core writes at its source-relative path under `assets`. */
	const outputOf = (file: string): string =>
		fs.readFileSync(
			path.join(app.config.absolutePaths.distDir, 'assets', path.relative(path.join(app.rootDir, 'src'), file)),
			'utf8',
		);
	return { stylesheets, bridge, refreshed, errors, outputOf };
}

describe('Tailwind v4 stylesheet rebuilds in development', () => {
	test('a new utility class in a created template appears in the stylesheet', async () => {
		const app = await createTailwindApp();
		app.write('src/pages/index.tsx', '<div className="bg-rose-600" />');
		const { stylesheets, bridge, refreshed, outputOf } = await startDevelopment(app);
		expect(outputOf(app.referencePath)).not.toContain('.text-amber-500');

		const added = app.write('src/pages/about.tsx', '<p className="text-amber-500" />');
		const rebuilt = await stylesheets.applyChanges(created(added), bridge);

		expect(rebuilt).toContain(app.referencePath);
		expect(refreshed).toContain(app.referencePath);
		expect(outputOf(app.referencePath)).toContain('.text-amber-500');
		expect(outputOf(app.referencePath)).toContain('.bg-rose-600');
	});

	test('a new utility class in an edited template appears, and an edit that adds none rebuilds nothing', async () => {
		const app = await createTailwindApp();
		const page = app.write('src/pages/index.tsx', '<div className="bg-rose-600" />');
		const { stylesheets, bridge, refreshed, outputOf } = await startDevelopment(app);

		app.write('src/pages/index.tsx', '<div className="bg-rose-600">changed text</div>');
		await stylesheets.applyChanges(changed(page), bridge);
		expect(refreshed).toEqual([]);

		app.write('src/pages/index.tsx', '<div className="bg-rose-600 text-amber-500" />');
		const rebuilt = await stylesheets.applyChanges(changed(page), bridge);

		expect(rebuilt).toContain(app.referencePath);
		expect(refreshed).toEqual([app.referencePath]);
		expect(outputOf(app.referencePath)).toContain('.text-amber-500');
	});

	test('a change to a file Tailwind does not scan rebuilds nothing', async () => {
		const app = await createTailwindApp();
		app.write('src/pages/index.tsx', '<div className="bg-rose-600" />');
		const { stylesheets, bridge, refreshed } = await startDevelopment(app);

		const lockfile = app.write('bun.lock', 'text-amber-500');
		await stylesheets.applyChanges(created(lockfile), bridge);
		app.write('bun.lock', 'text-amber-500 text-sky-500');
		await stylesheets.applyChanges(changed(lockfile), bridge);

		expect(refreshed).toEqual([]);
	});

	test('rebuilds only the stylesheets that scan the changed file', async () => {
		const app = await createTailwindApp();
		const left = app.write('src/left/left.css', '@import "tailwindcss" source("./");\n');
		const right = app.write('src/right/right.css', '@import "tailwindcss" source("./");\n');
		app.write('src/left/index.tsx', '<div className="bg-rose-600" />');
		app.write('src/right/index.tsx', '<div className="bg-sky-600" />');
		const { stylesheets, bridge, refreshed, outputOf } = await startDevelopment(app);

		const page = app.write('src/left/index.tsx', '<div className="bg-rose-600 text-amber-500" />');
		await stylesheets.applyChanges(changed(page), bridge);

		expect(refreshed).toContain(left);
		expect(refreshed).not.toContain(right);
		expect(outputOf(left)).toContain('.text-amber-500');
		expect(outputOf(right)).not.toContain('.text-amber-500');
	});

	test('a stylesheet that breaks keeps the last good output until a save fixes it, and keeps finding classes', async () => {
		const app = await createTailwindApp();
		app.write('src/pages/index.tsx', '<div className="bg-rose-600" />');
		const page = app.write('src/pages/index.css', '.btn { @apply p-4; }');
		const { stylesheets, bridge, refreshed, errors, outputOf } = await startDevelopment(app);
		const lastGood = stylesheets.version(page);

		app.write('src/pages/index.css', '.btn { @apply not-a-utility; }');
		await stylesheets.applyChanges(changed(page), bridge);

		expect(errors).toHaveLength(1);
		expect(errors[0]).toContain('not-a-utility');
		expect(stylesheets.version(page)).toBe(lastGood);

		const template = app.write('src/pages/index.tsx', '<div className="bg-rose-600 text-amber-500" />');
		await stylesheets.applyChanges(changed(template), bridge);
		expect(outputOf(app.referencePath)).toContain('.text-amber-500');

		app.write('src/pages/index.css', '.btn { @apply p-8; }');
		const rebuilt = await stylesheets.applyChanges(changed(page), bridge);

		expect(rebuilt).toContain(page);
		expect(refreshed).toContain(page);
		expect(outputOf(page)).toContain('* 8');
	});

	test('a plugin module that breaks keeps the last good output and the stylesheet builds again once it is fixed', async () => {
		const app = await createTailwindApp();
		app.write('src/pages/index.tsx', '<div className="tab-4" />');
		const plugin = app.write(
			'src/plugin.mjs',
			"export default ({ addUtilities }) => addUtilities({ '.tab-4': { 'tab-size': '4' } });",
		);
		const entry = app.write('src/styles/with-plugin.css', '@import "tailwindcss";\n@plugin "../plugin.mjs";\n');
		const { stylesheets, bridge, refreshed, errors, outputOf } = await startDevelopment(app);
		expect(outputOf(entry)).toContain('tab-size: 4');

		fs.writeFileSync(plugin, 'export default ;');
		await stylesheets.applyChanges(changed(plugin), bridge);
		expect(errors.length).toBeGreaterThan(0);
		expect(outputOf(entry)).toContain('tab-size: 4');
		expect(refreshed).toEqual([]);

		fs.writeFileSync(
			plugin,
			"export default ({ addUtilities }) => addUtilities({ '.tab-4': { 'tab-size': '6' } });",
		);
		await stylesheets.applyChanges(changed(plugin), bridge);

		expect(errors).toHaveLength(1);
		expect(refreshed).toContain(entry);
		expect(outputOf(entry)).toContain('.tab-4');
	});
});
