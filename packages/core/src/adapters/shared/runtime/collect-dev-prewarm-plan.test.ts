import { describe, expect, test } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';
import { collectAppDevPrewarmPlan } from './collect-dev-prewarm-plan.ts';

describe('collectAppDevPrewarmPlan', () => {
	test('merges and deduplicates configured and processor prewarm paths', async () => {
		const processor = {
			collectDevPrewarmPlan: async () => ({
				pathnames: ['/docs/introduction'],
			}),
		} as unknown as Processor;
		const appConfig = {
			devPrewarmPaths: ['/docs/installation', '/', '/docs/introduction'],
			processors: new Map([['docs', processor]]),
		} as unknown as EcoPagesAppConfig;

		expect(await collectAppDevPrewarmPlan(appConfig)).toEqual({
			pathnames: ['/docs/installation', '/', '/docs/introduction'],
		});
	});
});
