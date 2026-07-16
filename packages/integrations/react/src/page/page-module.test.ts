import { describe, expect, it } from 'vitest';
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
});
