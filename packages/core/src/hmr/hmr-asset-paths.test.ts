import { describe, expect, it } from 'vitest';
import {
	DEV_TRANSFORM_URL_PREFIX,
	HMR_DISK_URL_PREFIX,
	isDevTransformModuleUrl,
	isHmrDiskModuleUrl,
	stripModuleUrlQuery,
	withModuleCacheBust,
} from './hmr-asset-paths.ts';

describe('hmr asset paths', () => {
	it('detects dev transform module URLs', () => {
		expect(isDevTransformModuleUrl(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`)).toBe(true);
		expect(isDevTransformModuleUrl(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js?t=1`)).toBe(true);
		expect(isDevTransformModuleUrl(`${HMR_DISK_URL_PREFIX}/pages/index.js`)).toBe(false);
	});

	it('detects legacy HMR disk module URLs', () => {
		expect(isHmrDiskModuleUrl(`${HMR_DISK_URL_PREFIX}/components/counter.js`)).toBe(true);
		expect(isHmrDiskModuleUrl(`${DEV_TRANSFORM_URL_PREFIX}/pages/index.js`)).toBe(false);
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
