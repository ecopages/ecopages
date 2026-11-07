import { expect, test } from '@playwright/test';
import { registerReactAppTests } from './react-production-start.e2e-shared';

test.describe('A React app under `ecopages preview`', () => {
	registerReactAppTests(test, {
		rendersRequests: false,
		checkReactModule: (reactModule) => {
			expect(reactModule.cacheControl).toBe('public, max-age=31536000, immutable');
		},
	});
});
