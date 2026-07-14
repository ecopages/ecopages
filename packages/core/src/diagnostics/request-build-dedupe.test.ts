import { describe, expect, it, vi } from 'vitest';
import type { BuildResult } from '../build/build-adapter.ts';
import { requestBuildDedupe } from './request-build-dedupe.ts';

const successResult: BuildResult = {
	success: true,
	logs: [],
	outputs: [{ path: '/out/entry.js' }],
};

describe('requestBuildDedupe', () => {
	it('dedupes sequential identical builds within one request scope', async () => {
		let buildCount = 0;
		const build = vi.fn(async (): Promise<BuildResult> => {
			buildCount += 1;
			return successResult;
		});

		await requestBuildDedupe.run(async () => {
			await requestBuildDedupe.dedupeBuild('same-key', build);
			await requestBuildDedupe.dedupeBuild('same-key', build);
		});

		expect(buildCount).toBe(1);
		expect(build).toHaveBeenCalledTimes(1);
	});

	it('does not dedupe across separate request scopes', async () => {
		let buildCount = 0;
		const build = async (): Promise<BuildResult> => {
			buildCount += 1;
			return successResult;
		};

		await requestBuildDedupe.run(async () => {
			await requestBuildDedupe.dedupeBuild('same-key', build);
		});
		await requestBuildDedupe.run(async () => {
			await requestBuildDedupe.dedupeBuild('same-key', build);
		});

		expect(buildCount).toBe(2);
	});

	it('bypasses dedupe when no request scope is active', async () => {
		let buildCount = 0;
		const build = async (): Promise<BuildResult> => {
			buildCount += 1;
			return successResult;
		};

		await requestBuildDedupe.dedupeBuild('same-key', build);
		await requestBuildDedupe.dedupeBuild('same-key', build);

		expect(buildCount).toBe(2);
	});
});
