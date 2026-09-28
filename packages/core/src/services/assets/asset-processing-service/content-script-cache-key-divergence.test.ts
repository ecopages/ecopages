import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { rapidhash } from '../../../utils/hash.ts';
import { getAssetDependencyKey } from './asset-dependency-keys.ts';
import type { ContentScriptAsset } from './assets.types.ts';

function generateHash(content: string): string {
	return rapidhash(content).toString();
}

function buildProcessorIdentitySegment(contentHash: string, dep: ContentScriptAsset): string {
	const attrsHash = dep.attributes ? generateHash(JSON.stringify(dep.attributes)) : '';
	const position = dep.position ?? '';
	const packageRole = dep.packageRole ?? '';

	return `content-script:${contentHash}:${contentHash}:${position}:${attrsHash}:${packageRole}`;
}

function createBundleConfigHash(
	dep: ContentScriptAsset,
	options: { shouldBundle: boolean; isProduction: boolean },
): string {
	return generateHash(
		JSON.stringify({
			bundle: options.shouldBundle,
			minify: options.shouldBundle && options.isProduction,
			opts: dep.bundleOptions,
		}),
	);
}

/** Snapshot of the removed {@link ContentScriptProcessor} cache key for divergence tests. */
function getContentScriptProcessorCacheKey(
	dep: ContentScriptAsset,
	options: { shouldBundle: boolean; isProduction: boolean },
): string {
	const contentHash = generateHash(dep.content);
	const configHash = createBundleConfigHash(dep, options);

	return `${buildProcessorIdentitySegment(contentHash, dep)}:${configHash}`;
}

function createContentScriptDep(overrides: Partial<ContentScriptAsset> = {}): ContentScriptAsset {
	return {
		kind: 'script',
		source: 'content',
		content: 'import "/test/project/src/page.ts";',
		position: 'head',
		attributes: { type: 'module', defer: '' },
		packageRole: 'page-script',
		...overrides,
	};
}

function processorKey(
	dep: ContentScriptAsset,
	options: { shouldBundle?: boolean; isProduction?: boolean } = {},
): string {
	const shouldBundle = options.shouldBundle ?? dep.bundle !== false;
	const isProduction = options.isProduction ?? process.env.NODE_ENV === 'production';

	return getContentScriptProcessorCacheKey(dep, { shouldBundle, isProduction });
}

describe('content-script cache key divergence', () => {
	const originalNodeEnv = process.env.NODE_ENV;

	beforeEach(() => {
		process.env.NODE_ENV = 'development';
	});

	afterEach(() => {
		process.env.NODE_ENV = originalNodeEnv;
	});

	test('processor and service keys use different formats for the same dependency', () => {
		const dep = createContentScriptDep();

		expect(processorKey(dep)).not.toBe(getAssetDependencyKey(dep));
	});

	test('processor minify identity follows NODE_ENV while service key uses bundleOptions.minify', () => {
		const dep = createContentScriptDep({
			bundleOptions: { minify: false },
		});
		const serviceKey = getAssetDependencyKey(dep);

		expect(processorKey(dep, { shouldBundle: true, isProduction: false })).not.toBe(
			processorKey(dep, { shouldBundle: true, isProduction: true }),
		);
		expect(getAssetDependencyKey({ ...dep, bundleOptions: { minify: true } })).not.toBe(serviceKey);
	});

	test('service key includes HTML attributes for cache identity', () => {
		const withoutAttributes = createContentScriptDep({ attributes: undefined });
		const withAttributes = createContentScriptDep({
			attributes: { type: 'module', defer: '', 'data-eco-page-bootstrap': 'react-router' },
		});

		expect(processorKey(withoutAttributes)).not.toBe(processorKey(withAttributes));
		expect(getAssetDependencyKey(withoutAttributes)).not.toBe(getAssetDependencyKey(withAttributes));
	});

	test('service key includes groupedBundle while processor key does not', () => {
		const withoutGroupedBundle = createContentScriptDep();
		const withGroupedBundle = createContentScriptDep({
			groupedBundle: { id: 'bundle-1', entryName: 'page-entry' },
		});

		expect(processorKey(withoutGroupedBundle)).toBe(processorKey(withGroupedBundle));
		expect(getAssetDependencyKey(withoutGroupedBundle)).not.toBe(getAssetDependencyKey(withGroupedBundle));
	});

	test('service key is stable for duplicate declarations with the same build signature', () => {
		const dep = createContentScriptDep({
			bundleOptions: {
				naming: '[name]-[hash].[ext]',
				external: ['react'],
			},
		});
		const duplicateDeclaration = createContentScriptDep({
			bundleOptions: {
				naming: '[name]-[hash].[ext]',
				external: ['react'],
			},
		});

		expect(getAssetDependencyKey(dep)).toBe(getAssetDependencyKey(duplicateDeclaration));
	});
});
