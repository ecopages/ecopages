import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fileSystem } from '@ecopages/file-system';
import type { BaseAsset, ProcessedAsset } from '../../assets.types.ts';
import { BaseProcessor } from './base-processor.ts';

type TestAsset = BaseAsset & {
	name: string;
};

class TestProcessor extends BaseProcessor<TestAsset> {
	processCalls = 0;

	async process(dep: TestAsset): Promise<ProcessedAsset> {
		return this.getOrProcess(dep.name, async () => {
			this.processCalls += 1;
			return {
				filepath: `/test/dist/assets/${dep.name}.js`,
				kind: dep.kind,
				inline: false,
			};
		});
	}
}

const originalExists = fileSystem.exists;

beforeEach(() => {
	fileSystem.exists = vi.fn(() => true);
});

afterEach(() => {
	fileSystem.exists = originalExists;
	vi.restoreAllMocks();
});

test('BaseProcessor - rebuilds cached outputs when emitted file was deleted', async () => {
	const existsMock = vi
		.fn()
		.mockImplementationOnce(() => false)
		.mockImplementation(() => true);
	fileSystem.exists = existsMock;

	const processor = new TestProcessor({
		appConfig: {
			absolutePaths: { distDir: '/test/dist' },
		} as any,
	});

	const asset: TestAsset = {
		kind: 'script',
		source: 'file',
		name: 'runtime-vendor',
	};

	await processor.process(asset);
	await processor.process(asset);

	expect(processor.processCalls).toBe(2);
});
