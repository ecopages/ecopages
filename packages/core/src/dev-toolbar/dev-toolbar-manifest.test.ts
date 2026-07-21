import { describe, expect, it } from 'vitest';
import { buildDevToolbarManifestPayload } from './dev-toolbar-manifest.ts';

describe('buildDevToolbarManifestPayload', () => {
	it('serializes route metadata and asset URLs', () => {
		const payload = buildDevToolbarManifestPayload({
			routeFile: '/tmp/src/pages/index.tsx',
			integrationName: 'react',
		});

		expect(payload).toEqual({
			route: '/tmp/src/pages/index.tsx',
			integration: 'react',
			pageBrowserGraph: undefined,
			vendorUrls: [],
			devTransformUrls: [],
		});
	});
});
