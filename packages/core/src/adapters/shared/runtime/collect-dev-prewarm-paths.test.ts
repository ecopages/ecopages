import { describe, expect, test } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';
import { collectAppDevPrewarmPaths } from './collect-dev-prewarm-paths.ts';

describe('collectAppDevPrewarmPaths', () => {
	test('merges and deduplicates configured and processor prewarm paths', async () => {
		const processor = {
			collectDevPrewarmPaths: async () => ['/docs/introduction'],
		} as unknown as Processor;
		const appConfig = {
			devPrewarmPaths: ['/docs/installation', '/', '/docs/introduction'],
			processors: new Map([['docs', processor]]),
		} as unknown as EcoPagesAppConfig;

		expect(await collectAppDevPrewarmPaths(appConfig)).toEqual(['/docs/installation', '/', '/docs/introduction']);
	});
});
