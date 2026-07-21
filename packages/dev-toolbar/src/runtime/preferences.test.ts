import { describe, expect, it } from 'vitest';
import { parseDevToolbarPlacement, readDevToolbarPreferences } from './preferences.ts';

describe('parseDevToolbarPlacement', () => {
	it('accepts all supported placements', () => {
		expect(parseDevToolbarPlacement('top')).toBe('top');
		expect(parseDevToolbarPlacement('bottom')).toBe('bottom');
		expect(parseDevToolbarPlacement('left')).toBe('left');
		expect(parseDevToolbarPlacement('right')).toBe('right');
	});

	it('falls back to bottom for unknown values', () => {
		expect(parseDevToolbarPlacement('center')).toBe('bottom');
		expect(parseDevToolbarPlacement(null)).toBe('bottom');
	});
});

describe('readDevToolbarPreferences', () => {
	it('defaults stealth to enabled', () => {
		const storage = new Map<string, string>();
		const original = globalThis.localStorage;
		Object.defineProperty(globalThis, 'localStorage', {
			configurable: true,
			value: {
				getItem: (key: string) => storage.get(key) ?? null,
				setItem: (key: string, value: string) => {
					storage.set(key, value);
				},
			},
		});

		try {
			expect(readDevToolbarPreferences().stealth).toBe(true);
		} finally {
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: original,
			});
		}
	});
});
