import { describe, expect, it, vi } from 'vitest';
import { parseDevToolbarPlacement, readDevToolbarPreferences } from './preferences.ts';

describe('parseDevToolbarPlacement', () => {
	it.each(['top', 'bottom', 'left', 'right'])('accepts the %s placement', (placement) => {
		expect(parseDevToolbarPlacement(placement)).toBe(placement);
	});

	it('falls back to bottom for unknown values', () => {
		expect(parseDevToolbarPlacement('center')).toBe('bottom');
		expect(parseDevToolbarPlacement(null)).toBe('bottom');
	});
});

describe('readDevToolbarPreferences', () => {
	it('defaults stealth to enabled', () => {
		vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });

		expect(readDevToolbarPreferences().stealth).toBe(true);
	});
});
