import { DEV_TOOLBAR_PLACEMENT_STORAGE_KEY, DEV_TOOLBAR_STEALTH_STORAGE_KEY } from './constants.ts';

export type DevToolbarPlacement = 'top' | 'bottom' | 'left' | 'right';

export type DevToolbarPreferences = {
	placement: DevToolbarPlacement;
	stealth: boolean;
};

const DEFAULT_PREFERENCES: DevToolbarPreferences = {
	placement: 'bottom',
	stealth: true,
};

export function parseDevToolbarPlacement(value: string | null | undefined): DevToolbarPlacement {
	if (value === 'top' || value === 'bottom' || value === 'left' || value === 'right') {
		return value;
	}

	return DEFAULT_PREFERENCES.placement;
}

export function isVerticalDockPlacement(placement: DevToolbarPlacement): boolean {
	return placement === 'left' || placement === 'right';
}

export function readDevToolbarPreferences(): DevToolbarPreferences {
	const placement = localStorage.getItem(DEV_TOOLBAR_PLACEMENT_STORAGE_KEY);
	const stealth = localStorage.getItem(DEV_TOOLBAR_STEALTH_STORAGE_KEY);

	return {
		placement: parseDevToolbarPlacement(placement),
		stealth: stealth === null ? DEFAULT_PREFERENCES.stealth : stealth !== 'false',
	};
}

export function writeDevToolbarPreferences(partial: Partial<DevToolbarPreferences>): DevToolbarPreferences {
	const current = readDevToolbarPreferences();
	const next: DevToolbarPreferences = {
		placement: partial.placement ?? current.placement,
		stealth: partial.stealth ?? current.stealth,
	};

	localStorage.setItem(DEV_TOOLBAR_PLACEMENT_STORAGE_KEY, next.placement);
	localStorage.setItem(DEV_TOOLBAR_STEALTH_STORAGE_KEY, String(next.stealth));

	return next;
}
