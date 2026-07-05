import { describe, expect, it } from 'vitest';
import { docsManifestConfig } from '../manifest/docs-manifest.config';
import { resolveDocsBreadcrumb } from '@/lib/docs-kit/navigation/resolve-docs-breadcrumb';

describe('resolveDocsBreadcrumb', () => {
	it('returns crumbs pointing to the global docs index', () => {
		const crumbs = resolveDocsBreadcrumb(docsManifestConfig, 'core', 'hmr');

		expect(crumbs).toEqual([
			{ label: 'Docs', href: '/docs/getting-started/introduction' },
			{ label: 'Core Concepts', href: '/docs/core/concepts' },
			{ label: 'HMR' },
		]);
	});

	it('returns an empty list for unknown pages', () => {
		expect(resolveDocsBreadcrumb(docsManifestConfig, 'missing', 'page')).toEqual([]);
	});
});
