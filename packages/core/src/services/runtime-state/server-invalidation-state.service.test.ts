import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../../types/internal-types.ts';
import { getAppServerInvalidationState } from './server-invalidation-state.service.ts';

describe('getAppServerInvalidationState', () => {
	it('keeps one counter per app when none was installed', () => {
		const appConfig = {} as EcoPagesAppConfig;

		getAppServerInvalidationState(appConfig).invalidateServerModules();

		expect(getAppServerInvalidationState(appConfig).getServerInvalidationVersion()).toBe(1);
	});
});
