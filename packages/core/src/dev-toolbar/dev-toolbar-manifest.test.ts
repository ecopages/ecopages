import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { path } from '@ecopages/file-system/path';
import { buildDevToolbarManifestPayload } from './dev-toolbar-manifest.ts';

const manifestSourcePath = path.fromFileUrl(new URL('./dev-toolbar-manifest.ts', import.meta.url));

describe('buildDevToolbarManifestPayload', () => {
	it('does not import the optional dev-toolbar package', () => {
		const source = readFileSync(manifestSourcePath, 'utf8');
		expect(source).not.toContain('@ecopages/dev-toolbar');
	});

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
