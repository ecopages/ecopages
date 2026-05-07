import { describe, expect, it } from 'vitest';
import type { ProcessedAsset } from '../../services/assets/asset-processing-service/index.ts';
import { PagePackagingService } from './page-packaging.service.ts';

describe('PagePackagingService', () => {
	it('classifies page assets, inline assets, separate assets, and dynamic chunks', () => {
		const service = new PagePackagingService();
		const pageScript = {
			kind: 'script',
			srcUrl: '/assets/page.js',
			position: 'head',
		} as ProcessedAsset;
		const pageStylesheet = {
			kind: 'stylesheet',
			srcUrl: '/assets/page.css',
			position: 'head',
		} as ProcessedAsset;
		const runtimeScript = {
			kind: 'script',
			srcUrl: '/assets/vendors/react.js',
			position: 'head',
			excludeFromHtml: true,
			packageRole: 'runtime',
		} as ProcessedAsset;
		const inlineScript = {
			kind: 'script',
			content: 'console.log("inline")',
			inline: true,
			position: 'head',
		} as ProcessedAsset;
		const dynamicChunk = {
			kind: 'script',
			srcUrl: '/assets/chunks/page-chunk.js',
			position: 'head',
			packageRole: 'dynamic-chunk',
		} as ProcessedAsset;

		const result = service.createPagePackage([
			pageStylesheet,
			pageScript,
			runtimeScript,
			inlineScript,
			dynamicChunk,
		]);

		expect(result.pageScript).toBe(pageScript);
		expect(result.pageStylesheet).toBe(pageStylesheet);
		expect(result.htmlAssets).toEqual([pageStylesheet, pageScript, inlineScript, dynamicChunk]);
		expect(result.inlineAssets).toEqual([inlineScript]);
		expect(result.separateAssets).toEqual([runtimeScript]);
		expect(result.dynamicChunks).toEqual([dynamicChunk]);
	});

	it('prefers explicit page roles over visibility heuristics', () => {
		const service = new PagePackagingService();
		const hiddenPageScript = {
			kind: 'script',
			srcUrl: '/assets/pages/index.js',
			position: 'head',
			excludeFromHtml: true,
			packageRole: 'page-script',
		} as ProcessedAsset;
		const hydrationBootstrap = {
			kind: 'script',
			srcUrl: '/assets/pages/index-hydration.js',
			position: 'head',
			packageRole: 'keep-separate',
		} as ProcessedAsset;

		const result = service.createPagePackage([hiddenPageScript, hydrationBootstrap]);

		expect(result.pageScript).toBe(hiddenPageScript);
		expect(result.htmlAssets).toEqual([hydrationBootstrap]);
		expect(result.separateAssets).toEqual([hydrationBootstrap]);
	});
});