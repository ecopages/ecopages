import { expect, it } from 'vitest';
import * as core from '@ecopages/core/dev-toolbar/build-error-contract';
import * as client from './build-error-contract.ts';

it('keeps browser event names compatible with the core contract', () => {
	expect(client).toEqual(core);
});
