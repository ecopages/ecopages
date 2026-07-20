import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test, vi } from 'vitest';
import { HmrEntrypointRegistrar } from './hmr-entrypoint-registrar.ts';

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

test('HmrEntrypointRegistrar commits only after verified output exists', async () => {
	const rootDir = createTempRoot('hmr-registrar-success');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, '.eco', 'assets', '_hmr');
	fs.mkdirSync(srcDir, { recursive: true });
	fs.mkdirSync(distDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'widget.script.ts');
	fs.writeFileSync(entrypointPath, 'console.log("widget");', 'utf8');

	const registrar = new HmrEntrypointRegistrar({ srcDir, distDir });
	const outputPath = path.join(distDir, 'widget.script.js');

	const resolved = await registrar.registerEntrypoint(entrypointPath, {
		emit: async () => {
			fs.writeFileSync(outputPath, 'bundled', 'utf8');
		},
		getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
	});

	assert.equal(resolved.outputUrl, '/assets/_hmr/widget.script.js');
	assert.equal(resolved.outputPath, outputPath);
	assert.equal(registrar.getRegistered().has(path.resolve(entrypointPath)), true);
});

test('HmrEntrypointRegistrar rejects when emit completes without output', async () => {
	const rootDir = createTempRoot('hmr-registrar-missing-output');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, '.eco', 'assets', '_hmr');
	fs.mkdirSync(srcDir, { recursive: true });
	fs.mkdirSync(distDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'missing.script.ts');
	fs.writeFileSync(entrypointPath, 'export {}', 'utf8');

	const registrar = new HmrEntrypointRegistrar({ srcDir, distDir });

	await assert.rejects(
		() =>
			registrar.registerEntrypoint(entrypointPath, {
				emit: async () => {},
				getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
			}),
		/missing/,
	);

	assert.equal(registrar.getRegistered().size, 0);
});

test('HmrEntrypointRegistrar deduplicates concurrent registrations', async () => {
	const rootDir = createTempRoot('hmr-registrar-concurrent');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, '.eco', 'assets', '_hmr');
	fs.mkdirSync(srcDir, { recursive: true });
	fs.mkdirSync(distDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'counter.script.ts');
	fs.writeFileSync(entrypointPath, 'export {}', 'utf8');

	const registrar = new HmrEntrypointRegistrar({ srcDir, distDir });
	const outputPath = path.join(distDir, 'counter.script.js');
	let emitCalls = 0;

	const [first, second] = await Promise.all([
		registrar.registerEntrypoint(entrypointPath, {
			emit: async () => {
				emitCalls += 1;
				await new Promise((resolve) => setTimeout(resolve, 25));
				fs.writeFileSync(outputPath, 'bundled', 'utf8');
			},
			getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
		}),
		registrar.registerEntrypoint(entrypointPath, {
			emit: async () => {
				emitCalls += 1;
				await new Promise((resolve) => setTimeout(resolve, 25));
				fs.writeFileSync(outputPath, 'bundled', 'utf8');
			},
			getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
		}),
	]);

	assert.equal(emitCalls, 1);
	assert.equal(first.outputUrl, second.outputUrl);
});

test('registerTransformModule tracks transform URLs without invoking emit', async () => {
	const rootDir = createTempRoot('hmr-registrar-seed');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, '.eco', 'assets', '_hmr');
	fs.mkdirSync(srcDir, { recursive: true });
	fs.mkdirSync(distDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'seeded.script.ts');
	fs.writeFileSync(entrypointPath, 'export {}', 'utf8');
	const outputPath = path.join(distDir, 'seeded.script.js');
	fs.writeFileSync(outputPath, 'bundled', 'utf8');

	const registrar = new HmrEntrypointRegistrar({ srcDir, distDir });
	let emitCalls = 0;
	registrar.registerTransformModule(entrypointPath, '/assets/__eco_dev__/seeded.script.js', { role: 'page' });

	const registered = registrar.getRegistered().get(path.resolve(entrypointPath));
	assert.equal(registered?.outputUrl, '/assets/__eco_dev__/seeded.script.js');
	assert.equal(registrar.getWatchedFiles().has(path.resolve(entrypointPath)), true);

	// registerEntrypoint still rebuilds Rolldown artifacts when invoked explicitly.
	await registrar.registerEntrypoint(entrypointPath, {
		emit: async () => {
			emitCalls += 1;
		},
		getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
	});

	assert.equal(emitCalls, 0);
});

test('trackInFlightEntrypoint coalesces concurrent registerEntrypoint callers', async () => {
	const rootDir = createTempRoot('hmr-registrar-inflight');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, '.eco', 'assets', '_hmr');
	fs.mkdirSync(srcDir, { recursive: true });
	fs.mkdirSync(distDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'inflight.tsx');
	fs.writeFileSync(entrypointPath, 'export {}', 'utf8');
	const outputPath = path.join(distDir, 'pages', 'inflight.js');
	fs.mkdirSync(path.dirname(outputPath), { recursive: true });

	const registrar = new HmrEntrypointRegistrar({ srcDir, distDir });
	let emitCalls = 0;
	const sharedPromise = (async () => {
		await new Promise((resolve) => setTimeout(resolve, 25));
		fs.writeFileSync(outputPath, 'bundled', 'utf8');
		return {
			sourcePath: entrypointPath,
			outputPath,
			outputUrl: '/assets/_hmr/pages/inflight.js',
		};
	})();

	registrar.trackInFlightEntrypoint(entrypointPath, sharedPromise);

	const [first, second] = await Promise.all([
		registrar.registerEntrypoint(entrypointPath, {
			emit: async () => {
				emitCalls += 1;
			},
			getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
		}),
		registrar.registerEntrypoint(entrypointPath, {
			emit: async () => {
				emitCalls += 1;
			},
			getMissingOutputError: (source, output) => new Error(`missing ${source} -> ${output}`),
		}),
	]);

	assert.equal(emitCalls, 0);
	assert.equal(first.outputUrl, '/assets/_hmr/pages/inflight.js');
	assert.equal(second.outputUrl, first.outputUrl);
});

test('tryTrackInFlightEntrypoint returns false when on-demand registration already owns the slot', async () => {
	const rootDir = createTempRoot('hmr-registrar-try-track');
	const srcDir = path.join(rootDir, 'src');
	const distDir = path.join(rootDir, '.eco', 'assets', '_hmr');
	fs.mkdirSync(srcDir, { recursive: true });
	fs.mkdirSync(distDir, { recursive: true });

	const entrypointPath = path.join(srcDir, 'owned.tsx');
	fs.writeFileSync(entrypointPath, 'export {}', 'utf8');

	const registrar = new HmrEntrypointRegistrar({ srcDir, distDir });
	const onDemandPromise = Promise.resolve({
		sourcePath: entrypointPath,
		outputPath: path.join(distDir, 'pages', 'owned.js'),
		outputUrl: '/assets/_hmr/pages/owned.js',
	});

	registrar.trackInFlightEntrypoint(entrypointPath, onDemandPromise);

	const reserved = registrar.tryTrackInFlightEntrypoint(
		entrypointPath,
		Promise.resolve({
			sourcePath: entrypointPath,
			outputPath: path.join(distDir, 'pages', 'owned.js'),
			outputUrl: '/assets/_hmr/pages/owned.js',
		}),
	);

	assert.equal(reserved, false);
});
