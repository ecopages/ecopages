import { describe, expect, it } from 'vitest';
import { ReactPageModuleService } from './react-page-module.service.ts';

describe('ReactPageModuleService', () => {
	it('detects configured MDX extensions', () => {
		const service = new ReactPageModuleService({
			mdxExtensions: ['.mdx'],
			integrationName: 'react',
			hasRouterAdapter: false,
		});

		expect(service.isMdxFile('/tmp/app/src/pages/guide.mdx')).toBe(true);
		expect(service.isMdxFile('/tmp/app/src/pages/guide.tsx')).toBe(false);
	});
});
