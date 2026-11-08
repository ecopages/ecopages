import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTempRoot, startHmrManager } from '../../adapters/shared/hmr/hmr-manager.test-helpers.ts';
import { finalizeEcoPagesConfig } from '../../config/assembly/finalize-config.ts';
import { requireAppRuntime } from '../../utils/app-runtime.ts';
import { keepsLastGoodOutput, showAssetFailure } from './last-good-output.ts';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('keepsLastGoodOutput', () => {
	test.each([
		['development', false, true],
		['development', true, false],
		['production', false, false],
		['production', true, false],
		['test', false, false],
	])('in %s with static generation %s is %s', async (mode, staticGenerationActive, expected) => {
		vi.stubEnv('NODE_ENV', mode);
		const config = await finalizeEcoPagesConfig({
			rootDir: createTempRoot('ecopages-last-good-rule'),
			integrations: [],
		});
		requireAppRuntime(config).staticGenerationActive = staticGenerationActive;

		expect(keepsLastGoodOutput(config)).toBe(expected);
	});
});

describe('showAssetFailure', () => {
	test('names the kind and the source of the asset in the message the overlay shows', async () => {
		const config = await finalizeEcoPagesConfig({
			rootDir: createTempRoot('ecopages-last-good-message'),
			integrations: [],
		});
		const { manager } = startHmrManager(config);
		const reportBuildError = vi.spyOn(manager, 'reportBuildError');

		showAssetFailure(config, 'script', '/app/src/counter.ts', new Error('Unexpected token'));

		expect(reportBuildError).toHaveBeenCalledWith(
			'/app/src/counter.ts',
			'Failed to process script /app/src/counter.ts: Unexpected token',
		);
	});
});
