import { expect, test } from '@playwright/test';
import type { APIRequestContext } from 'playwright-core';
import { gotoPath, trackRuntimeErrors } from './helpers';

const VENDOR_SHARE_A_MODULE = '/assets/__eco_dev__/pages/vendor-share/a.react.js';
const VENDOR_SHARE_B_MODULE = '/assets/__eco_dev__/pages/vendor-share/b.react.js';
const VENDOR_SHARE_DATA_MODULE = '/assets/__eco_dev__/data/vendor-share.js';

function extractVendorImportUrls(moduleSource: string): string[] {
	const matches = moduleSource.matchAll(/from\s+["'](\/assets\/vendors\/[^"']+)["']/g);
	return [...matches].map((match) => match[1]);
}

function findZodVendorUrl(vendorImports: string[]): string {
	const zodVendorUrl = vendorImports.find((url) => url.includes('/assets/vendors/zod'));
	expect(zodVendorUrl, 'expected zod vendor import').toBeDefined();
	if (!zodVendorUrl) {
		throw new Error('expected zod vendor import');
	}

	return zodVendorUrl;
}

async function fetchModuleSource(request: APIRequestContext, moduleUrl: string): Promise<string> {
	const response = await request.get(moduleUrl);
	expect(response.ok(), `expected ${moduleUrl} to be served`).toBe(true);
	return response.text();
}

function assertDataModuleUsesZodVendor(dataSource: string): void {
	const dataVendorImports = extractVendorImportUrls(dataSource);

	expect(dataVendorImports.some((url) => url.includes('/assets/vendors/zod'))).toBe(true);
	expect(dataSource).not.toContain('node_modules/zod');
}

function assertPageModuleUsesReactVendor(pageSource: string): string[] {
	const pageVendorImports = extractVendorImportUrls(pageSource);

	expect(pageVendorImports.some((url) => url.includes('/assets/vendors/react'))).toBe(true);
	expect(pageSource).not.toContain('node_modules/react');

	return pageVendorImports;
}

test.describe('Shared browser vendors @content', () => {
	test('vendor-share pages import shared vendors and reuse the same zod URL across navigations', async ({
		page,
		request,
	}) => {
		const runtime = trackRuntimeErrors(page);
		const zodVendorRequests: string[] = [];

		page.on('response', (response) => {
			const url = response.url();
			if (url.includes('/assets/vendors/zod')) {
				zodVendorRequests.push(url);
			}
		});

		const dataSource = await fetchModuleSource(request, VENDOR_SHARE_DATA_MODULE);
		assertDataModuleUsesZodVendor(dataSource);
		const zodVendorUrl = findZodVendorUrl(extractVendorImportUrls(dataSource));

		await gotoPath(page, '/vendor-share/a');
		await expect(page.getByTestId('page-vendor-share-a')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('vendor-share-label')).toHaveText('vendor-share-a');

		assertPageModuleUsesReactVendor(await fetchModuleSource(request, VENDOR_SHARE_A_MODULE));

		const zodVendorResponse = await request.get(zodVendorUrl);
		expect(zodVendorResponse.ok()).toBe(true);
		expect(zodVendorResponse.headers()['cache-control']).toMatch(/immutable/i);

		await gotoPath(page, '/vendor-share/b');
		await expect(page.getByTestId('page-vendor-share-b')).toBeVisible({ timeout: 15_000 });
		await expect(page.getByTestId('vendor-share-label')).toHaveText('vendor-share-b');

		assertPageModuleUsesReactVendor(await fetchModuleSource(request, VENDOR_SHARE_B_MODULE));

		const zodUrls = [...new Set(zodVendorRequests.map((url) => new URL(url).pathname))];
		expect(zodUrls).toHaveLength(1);
		expect(zodUrls[0]).toBe(zodVendorUrl);

		runtime.assertClean();
	});
});
