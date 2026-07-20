import { describe, expect, it, vi } from 'vitest';
import { DEV_TRANSFORM_URL_PREFIX, HMR_DISK_URL_PREFIX } from '../hmr-asset-paths.ts';
import { applyModuleUpdate, resolveActiveModuleUrl } from './module-update.ts';

describe('resolveActiveModuleUrl', () => {
	it('prefers the active dev transform page module', () => {
		const moduleUrl = resolveActiveModuleUrl(
			{
				[`${HMR_DISK_URL_PREFIX}/components/counter.js`]: vi.fn(),
			},
			`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`,
		);

		expect(moduleUrl).toBe(`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`);
	});

	it('prefers the latest dev transform handler when no page module is set', () => {
		const moduleUrl = resolveActiveModuleUrl({
			[`${HMR_DISK_URL_PREFIX}/components/counter.js`]: vi.fn(),
			[`${DEV_TRANSFORM_URL_PREFIX}/pages/about.js`]: vi.fn(),
			[`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`]: vi.fn(),
		});

		expect(moduleUrl).toBe(`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`);
	});
});

describe('applyModuleUpdate', () => {
	it('invokes registered handlers for dev transform modules', async () => {
		const handler = vi.fn(async () => undefined);
		const reloadCurrentPage = vi.fn(async () => true);
		const importModule = vi.fn(async () => ({}));

		await applyModuleUpdate(
			`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`,
			{
				getHandlers: () => ({
					[`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`]: handler,
				}),
				reloadCurrentPage,
				importModule,
				waitForSettled: async () => undefined,
			},
			99,
		);

		expect(handler).toHaveBeenCalledWith(`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js?t=99`);
		expect(reloadCurrentPage).not.toHaveBeenCalled();
		expect(importModule).not.toHaveBeenCalled();
	});

	it('re-imports dev transform modules that are not the active page', async () => {
		const reloadCurrentPage = vi.fn(async () => true);
		const importModule = vi.fn(async () => ({}));

		await applyModuleUpdate(`${DEV_TRANSFORM_URL_PREFIX}/layouts/base-layout/base-layout.script.js`, {
			getHandlers: () => ({}),
			getActivePageModule: () => `${DEV_TRANSFORM_URL_PREFIX}/pages/script-hmr.js`,
			reloadCurrentPage,
			importModule,
			waitForSettled: async () => undefined,
		});

		expect(importModule).toHaveBeenCalledWith(
			expect.stringContaining(`${DEV_TRANSFORM_URL_PREFIX}/layouts/base-layout/base-layout.script.js?t=`),
		);
		expect(reloadCurrentPage).not.toHaveBeenCalled();
	});

	it('re-imports registered component script entrypoints that are not the active page', async () => {
		const reloadCurrentPage = vi.fn(async () => true);
		const importModule = vi.fn(async () => ({}));

		await applyModuleUpdate(`${DEV_TRANSFORM_URL_PREFIX}/components/script-hmr/script-hmr-marker.eco.js`, {
			getHandlers: () => ({}),
			getActivePageModule: () => `${DEV_TRANSFORM_URL_PREFIX}/pages/script-hmr.js`,
			reloadCurrentPage,
			importModule,
			waitForSettled: async () => undefined,
		});

		expect(importModule).toHaveBeenCalledWith(
			expect.stringContaining(`${DEV_TRANSFORM_URL_PREFIX}/components/script-hmr/script-hmr-marker.eco.js?t=`),
		);
		expect(reloadCurrentPage).not.toHaveBeenCalled();
	});

	it('reloads through the navigation runtime when a dev transform handler is missing', async () => {
		const reloadCurrentPage = vi.fn(async () => true);
		const importModule = vi.fn(async () => ({}));
		const pageModule = `${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js`;

		await applyModuleUpdate(pageModule, {
			getHandlers: () => ({}),
			getActivePageModule: () => pageModule,
			reloadCurrentPage,
			importModule,
			waitForSettled: async () => undefined,
		});

		expect(importModule).not.toHaveBeenCalled();
		expect(reloadCurrentPage).toHaveBeenCalledWith({
			clearCache: false,
			moduleUrl: expect.stringContaining(`${DEV_TRANSFORM_URL_PREFIX}/pages/docs/index.js?t=`),
		});
	});

	it('warns when a module update has no handler and is not dev-transform', async () => {
		const reloadCurrentPage = vi.fn(async () => true);
		const importModule = vi.fn(async () => ({}));
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		await applyModuleUpdate(`${HMR_DISK_URL_PREFIX}/components/counter.js`, {
			getHandlers: () => ({}),
			reloadCurrentPage,
			importModule,
			waitForSettled: async () => undefined,
		});

		expect(importModule).not.toHaveBeenCalled();
		expect(reloadCurrentPage).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith(
			'[ecopages] No HMR handler for module update: /assets/_hmr/components/counter.js',
		);
	});
});
