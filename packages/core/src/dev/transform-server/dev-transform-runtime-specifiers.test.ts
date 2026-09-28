import { describe, expect, it } from 'vitest';
import { mergeContributorRuntimeSpecifierMaps } from './dev-transform-runtime-specifiers.ts';
import type { DevTransformBundleContributor } from './types.ts';

function createContributor(specifiers: ReadonlyMap<string, string>): DevTransformBundleContributor {
	return {
		ownsModule: () => false,
		getModulePlugins: async () => [],
		getRuntimeSpecifierMap: () => specifiers,
	};
}

describe('mergeContributorRuntimeSpecifierMaps', () => {
	it('merges contributor runtime specifier maps with later entries winning', () => {
		const merged = mergeContributorRuntimeSpecifierMaps([
			createContributor(
				new Map([
					['react', '/assets/vendors/react.js'],
					['react-dom', '/assets/vendors/react-dom.js'],
				]),
			),
			createContributor(new Map([['react', '/assets/vendors/react.development.js']])),
		]);

		expect(merged.get('react')).toBe('/assets/vendors/react.development.js');
		expect(merged.get('react-dom')).toBe('/assets/vendors/react-dom.js');
	});
});
