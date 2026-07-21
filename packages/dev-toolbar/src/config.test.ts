import { describe, expect, it } from 'vitest';
import { devToolbar } from './config.ts';

describe('devToolbar', () => {
	it('returns the package config', () => {
		expect(devToolbar()).toEqual({
			package: '@ecopages/dev-toolbar',
		});
	});

	it('accepts enabled', () => {
		expect(devToolbar({ enabled: false })).toEqual({
			package: '@ecopages/dev-toolbar',
			enabled: false,
		});
	});
});
