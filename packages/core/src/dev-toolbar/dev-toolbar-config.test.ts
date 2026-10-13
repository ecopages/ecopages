import { describe, expect, it, vi } from 'vitest';
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

	it('returns false when ECOPAGES_DEV_TOOLBAR=false', () => {
		vi.stubEnv('ECOPAGES_DEV_TOOLBAR', 'false');
		expect(isDevToolbarEnabled(configuredApp, { watch: true })).toBe(false);
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
		vi.stubEnv('ECOPAGES_DEV_TOOLBAR', undefined);
		expect(isDevToolbarEnabled({} as EcoPagesAppConfig, { watch: true })).toBe(false);
	});

	it('returns true in watch mode when a package is configured', () => {
		vi.stubEnv('ECOPAGES_DEV_TOOLBAR', undefined);
		expect(isDevToolbarEnabled(configuredApp, { watch: true })).toBe(true);
	});
});
