import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { EcoBuildPlugin } from '../build/build-types.ts';
import type { EcoPagesAppConfig } from '../internal-types';
import { Processor, type ProcessorConfig } from './processor.ts';

class TestProcessor extends Processor {
	override buildPlugins?: EcoBuildPlugin[] = [];
	override plugins?: EcoBuildPlugin[] = [];

	override async setup(): Promise<void> {}

	override async process(input: unknown, _filePath?: string): Promise<unknown> {
		return input;
	}

	override async teardown(): Promise<void> {}
}

describe('Processor', () => {
	let processor: TestProcessor;
	let config: ProcessorConfig;
	let appConfig: EcoPagesAppConfig;

	beforeEach(() => {
		config = {
			name: 'test-processor',
			options: { test: true },
			watch: {
				paths: ['/test'],
			},
		};

		const testRoot = path.join(process.cwd(), '.test-tmp', 'processor-test');

		if (fs.existsSync(testRoot)) {
			fs.rmSync(testRoot, { recursive: true, force: true });
		}

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

	afterAll(() => {
		fs.rmSync(path.join(process.cwd(), '.test-tmp'), { recursive: true, force: true });
	});

	test('should initialize with correct name', () => {
		expect(processor.getName()).toBe('test-processor');
	});

	test('should retain runtime capability declarations', () => {
		const runtimeProcessor = new TestProcessor({
			name: 'runtime-processor',
			runtimeCapability: {
				tags: ['requires-node-builtins'],
				minRuntimeVersion: '18.0.0',
			},
		});

		expect(runtimeProcessor.runtimeCapability).toEqual({
			tags: ['requires-node-builtins'],
			minRuntimeVersion: '18.0.0',
		});
	});

	test('should return watch config', () => {
		expect(processor.getWatchConfig()).toEqual({
			paths: ['/test'],
		});
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
});
