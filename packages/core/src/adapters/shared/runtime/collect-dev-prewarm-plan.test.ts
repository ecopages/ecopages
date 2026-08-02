import { describe, expect, test } from 'vitest';
import type { EcoPagesAppConfig } from '../../../types/internal-types.ts';
import type { Processor } from '../../../plugins/processor.ts';
import { collectAppDevPrewarmPlan } from './collect-dev-prewarm-plan.ts';

describe('collectAppDevPrewarmPlan', () => {
	test('merges background and critical static paths', async () => {
		const processor = {
			collectDevPrewarmPlan: async () => ({
				pathnames: ['/docs/introduction'],
				readiness: 'background' as const,
			}),
		} as unknown as Processor;
		const appConfig = {
			devPrewarmPaths: ['/docs/installation'],
			devPrewarmBeforeReadyPaths: ['/'],
			processors: new Map([['docs', processor]]),
		} as unknown as EcoPagesAppConfig;

		expect(await collectAppDevPrewarmPlan(appConfig)).toEqual({
			pathnames: ['/docs/installation', '/docs/introduction', '/'],
			beforeReadyPathnames: ['/'],
			readiness: 'background',
		});
	});

	test('promotes processor before-ready paths to the critical set', async () => {
		const processor = {
			collectDevPrewarmPlan: async () => ({
				pathnames: ['/docs/introduction'],
				readiness: 'beforeReady' as const,
			}),
		} as unknown as Processor;
		const appConfig = {
			processors: new Map([['docs', processor]]),
		} as unknown as EcoPagesAppConfig;

		expect(await collectAppDevPrewarmPlan(appConfig)).toEqual({
			pathnames: ['/docs/introduction'],
			beforeReadyPathnames: ['/docs/introduction'],
			readiness: 'beforeReady',
		});
	});
});
