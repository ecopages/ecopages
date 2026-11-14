import { describe, expect, it } from 'vitest';
import { getComponentIdentity } from '@ecopages/core';
import { PageModuleService } from './page-module.ts';

describe('PageModuleService', () => {
	it('detects configured MDX extensions', () => {
		const service = new PageModuleService({
			mdxExtensions: ['.mdx'],
			integrationName: 'react',
			hasRouterAdapter: false,
		});

		expect(service.isMdxFile('/tmp/app/src/pages/guide.mdx')).toBe(true);
		expect(service.isMdxFile('/tmp/app/src/pages/guide.tsx')).toBe(false);
	});

	describe('ensureConfigFileMetadata', () => {
		const service = new PageModuleService({
			mdxExtensions: ['.mdx'],
			integrationName: 'react',
			hasRouterAdapter: false,
		});

		it('binds a config without identity to the page, wherever its relative script lives', () => {
			const config = service.ensureConfigFileMetadata(
				{ dependencies: { scripts: ['./shell.script.ts'] } },
				'/app/src/pages/guide.mdx',
			);

			expect(getComponentIdentity(config)).toMatchObject({
				file: '/app/src/pages/guide.mdx',
				integration: 'react',
			});
		});

		it('keeps an identity that already carries a file', () => {
			const identity = { id: 'kept', file: '/app/src/shells/kept.mdx', integration: 'mdx' };

			const config = service.ensureConfigFileMetadata({ identity }, '/app/src/pages/guide.mdx');

			expect(getComponentIdentity(config)).toEqual(identity);
		});
	});
});
