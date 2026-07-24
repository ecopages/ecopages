import { describe, expect, it } from 'vitest';
import { DEV_MANIFEST_ELEMENT_ID as coreManifestElementId } from '@ecopages/core/dev-toolbar/dev-toolbar-manifest-contract';
import { DEV_MANIFEST_ELEMENT_ID } from './manifest-contract.ts';

describe('manifest contract', () => {
	it('matches the core-owned dev manifest element id', () => {
		expect(DEV_MANIFEST_ELEMENT_ID).toBe(coreManifestElementId);
	});
});
