import { describe, expect, it } from 'vitest';
import {
	DEV_TRANSFORM_URL_PREFIX,
	isDevTransformModuleUrl,
	stripModuleUrlQuery,
	withModuleCacheBust,
} from './hmr-asset-paths.ts';

describe('hmr asset paths', () => {
	it('detects dev transform module URLs', () => {
		expect(isDevTransformModuleUrl(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`)).toBe(true);
		expect(isDevTransformModuleUrl(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js?t=1`)).toBe(true);
		expect(isDevTransformModuleUrl('/assets/built/pages/index.js')).toBe(false);
	});

	it('strips cache-busting query parameters', () => {
		expect(stripModuleUrlQuery('/assets/__eco_dev__/pages/index.js?t=123')).toBe(
			'/assets/__eco_dev__/pages/index.js',
		);
	});

	it('adds cache-busting query parameters', () => {
		expect(withModuleCacheBust('/assets/__eco_dev__/pages/index.js', 42)).toBe(
			'/assets/__eco_dev__/pages/index.js?t=42',
		);
	});
});
