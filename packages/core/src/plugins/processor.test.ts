import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EcoPagesAppConfig } from '../config/internal-types';
import {
	Processor,
	type ProcessorConfig,
	serializeGeneratedTypesPackage,
	writeGeneratedTypesPackage,
} from './processor.ts';

class TestProcessor extends Processor {
	override async setup(): Promise<void> {}
}

describe('Processor', () => {
	let processor: TestProcessor;
	let config: ProcessorConfig;
	let appConfig: EcoPagesAppConfig;
	const testRoots: string[] = [];

	beforeEach(() => {
		config = {
			name: 'test-processor',
			options: { test: true },
			watch: {
				paths: ['/test'],
			},
		};

		const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'processor-test-'));
		testRoots.push(testRoot);

		appConfig = {
			rootDir: testRoot,
			absolutePaths: {
				srcDir: path.join(testRoot, 'src'),
				distDir: path.join(testRoot, 'dist'),
			},
		} as EcoPagesAppConfig;

		processor = new TestProcessor(config);
		processor.setContext(appConfig);
	});

	afterEach(() => {
		for (const testRoot of testRoots.splice(0)) {
			fs.rmSync(testRoot, { recursive: true, force: true });
		}
	});

	test('should initialize with correct name', () => {
		expect(processor.getName()).toBe('test-processor');
	});

	test('should return watch config', () => {
		expect(processor.getWatchConfig()).toEqual({
			paths: ['/test'],
		});
	});

	test('setContext does not create the cache directory', () => {
		const cacheDir = path.join(testRoots[0]!, '.eco', 'cache', 'test-processor');
		expect(fs.existsSync(cacheDir)).toBe(false);
		expect(processor.listProductionServerModuleEntries()).toEqual([]);
	});

	test('stores a cache entry under a file name every platform accepts', async () => {
		const cacheProcessor = processor as unknown as {
			readCache<T>(key: string): Promise<T | null>;
			writeCache<T>(key: string, data: T): Promise<void>;
		};
		const key = 'photo.jpg:7ba5a4e0:q80:webp:320:sm,768:md';
		const cacheDir = path.join(testRoots[0]!, '.eco', 'cache', 'test-processor');

		await cacheProcessor.writeCache(key, { width: 320 });

		const [fileName, ...rest] = fs.readdirSync(cacheDir);
		expect(rest).toEqual([]);
		expect(fileName).toMatch(/^[\w.-]+$/);
		expect(await cacheProcessor.readCache(key)).toEqual({ width: 320 });
		expect(await cacheProcessor.readCache(`${key}:lg`)).toBeNull();
	});
});

describe('Processor capability matching', () => {
	test('matches all extensions with * pattern', () => {
		const processor = new TestProcessor({
			name: 'wildcard-all',
			capabilities: [{ kind: 'stylesheet', extensions: ['*'] }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.scss')).toBe(true);
	});

	test('matches explicit *.ext patterns', () => {
		const processor = new TestProcessor({
			name: 'wildcard-explicit',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'] }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.scss')).toBe(false);
	});

	test('matches grouped extension patterns', () => {
		const processor = new TestProcessor({
			name: 'wildcard-group',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.{css,scss,sass}'] }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.scss')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.sass')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.less')).toBe(false);
	});

	test('matches grouped patterns with mixed case and spacing', () => {
		const processor = new TestProcessor({
			name: 'wildcard-group-normalized',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.{ CSS, ScSs , .SASS }'] }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.scss')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.sass')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.less')).toBe(false);
	});

	test('matches plain extension and dotted extension forms', () => {
		const processor = new TestProcessor({
			name: 'plain-ext',
			capabilities: [{ kind: 'stylesheet', extensions: ['css', '.scss'] }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.scss')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.sass')).toBe(false);
	});

	test('respects capability kind filtering', () => {
		const processor = new TestProcessor({
			name: 'kind-filter',
			capabilities: [{ kind: 'image', extensions: ['*.png'] }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/styles/app.css')).toBe(false);
		expect(processor.canProcessAsset('image', '/src/assets/logo.png')).toBe(true);
	});

	test('applies a capability filename filter without retaining stateful regex flags', () => {
		const processor = new TestProcessor({
			name: 'capability-filter',
			capabilities: [{ kind: 'stylesheet', extensions: ['*.css'], filter: /\/src\/theme\.css$/gu }],
		});

		expect(processor.canProcessAsset('stylesheet', '/src/theme.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/theme.css')).toBe(true);
		expect(processor.canProcessAsset('stylesheet', '/src/other.css')).toBe(false);
	});
});

describe('generated types package', () => {
	test('serializes a TypeScript auto-loadable @types manifest', () => {
		expect(JSON.parse(serializeGeneratedTypesPackage('@types/ecopages-image-processor'))).toEqual({
			name: '@types/ecopages-image-processor',
			version: '0.0.0',
			types: './index.d.ts',
		});
	});

	test('writes the manifest under the generated types directory', () => {
		const written = new Map<string, string>();
		writeGeneratedTypesPackage({
			root: '/app',
			module: 'ecopages-image-processor',
			packageName: '@types/ecopages-image-processor',
			writeFile: (filePath, content) => written.set(filePath, content),
		});

		expect([...written.keys()]).toEqual([
			path.join('/app', 'node_modules/@types/ecopages-image-processor', 'package.json'),
		]);
	});
});
