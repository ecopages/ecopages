import { expect, it } from 'vitest';
import * as core from '@ecopages/core/client';
import * as client from './build-error-contract.ts';

it('keeps browser event names compatible with the core contract', () => {
	expect(client.BUILD_ERROR_EVENT).toBe(core.BUILD_ERROR_EVENT);
	expect(client.BUILD_ERROR_CLEAR_EVENT).toBe(core.BUILD_ERROR_CLEAR_EVENT);
	expect(client.BUILD_ERROR_REQUEST_EVENT).toBe(core.BUILD_ERROR_REQUEST_EVENT);
});
