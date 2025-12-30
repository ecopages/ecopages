import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import path from 'node:path';
import fs from 'node:fs';
import type { BunPlugin } from 'bun';
import type { EcoPagesAppConfig } from '../internal-types';
import { Processor, type ProcessorConfig } from './processor';

class TestProcessor extends Processor {
	buildPlugins?: BunPlugin[] = [];
	plugins?: BunPlugin[] = [];

	async setup(): Promise<void> {}
	async process(input: unknown): Promise<unknown> {
		return input;
	}
	async teardown(): Promise<void> {}
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

	test('should return watch config', () => {
		expect(processor.getWatchConfig()).toEqual({
			paths: ['/test'],
		});
	});
});
