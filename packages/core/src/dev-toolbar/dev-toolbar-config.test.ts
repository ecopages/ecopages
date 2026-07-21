import { describe, expect, it } from 'vitest';
import type { EcoPagesAppConfig } from '../types/internal-types.ts';
import { isDevToolbarEnabled } from './dev-toolbar-config.ts';

const referenceDevToolbarPackage = '@ecopages/dev-toolbar';

const configuredApp = {
	devToolbar: { package: referenceDevToolbarPackage },
} as EcoPagesAppConfig;

describe('isDevToolbarEnabled', () => {
	it('returns false outside watch mode', () => {
		expect(isDevToolbarEnabled(configuredApp, { watch: false })).toBe(false);
	});

	it('returns false when the host owns the dev client', () => {
		expect(isDevToolbarEnabled(configuredApp, { watch: true, hostOwnsDevClient: true })).toBe(false);
	});

	it('returns false when ECOPAGES_DEV_TOOLBAR=false', () => {
		const previous = process.env.ECOPAGES_DEV_TOOLBAR;
		process.env.ECOPAGES_DEV_TOOLBAR = 'false';
		expect(isDevToolbarEnabled(configuredApp, { watch: true })).toBe(false);
		process.env.ECOPAGES_DEV_TOOLBAR = previous;
	});

	it('returns false when config disables the toolbar', () => {
		expect(
			isDevToolbarEnabled(
				{ devToolbar: { package: referenceDevToolbarPackage, enabled: false } } as EcoPagesAppConfig,
				{ watch: true },
			),
		).toBe(false);
	});

	it('returns false when no client package is configured', () => {
		const previous = process.env.ECOPAGES_DEV_TOOLBAR;
		delete process.env.ECOPAGES_DEV_TOOLBAR;
		expect(isDevToolbarEnabled({} as EcoPagesAppConfig, { watch: true })).toBe(false);
		process.env.ECOPAGES_DEV_TOOLBAR = previous;
	});

	it('returns true in watch mode when a package is configured', () => {
		const previous = process.env.ECOPAGES_DEV_TOOLBAR;
		delete process.env.ECOPAGES_DEV_TOOLBAR;
		expect(isDevToolbarEnabled(configuredApp, { watch: true })).toBe(true);
		process.env.ECOPAGES_DEV_TOOLBAR = previous;
	});
});
