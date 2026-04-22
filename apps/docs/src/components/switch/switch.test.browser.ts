import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { RadiantSwitch } from './switch.script';

function resetDom(): void {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
}

function createSwitch(): RadiantSwitch {
	const element = document.createElement('radiant-switch') as RadiantSwitch;
	element.setAttribute('id', 'theme-switch');
	element.setAttribute('label', 'Theme');
	return element;
}

describe('RadiantSwitch', () => {
	beforeEach(() => {
		resetDom();
	});

	afterEach(() => {
		resetDom();
	});

	it('toggles checked state and emits a change event', async () => {
		const user = userEvent.setup();
		const changeSpy = vi.fn();
		const radiantSwitch = createSwitch();
		radiantSwitch.addEventListener('change', changeSpy);
		document.body.appendChild(radiantSwitch);

		let button: HTMLButtonElement | null = null;
		await vi.waitFor(() => {
			button = radiantSwitch.querySelector<HTMLButtonElement>('[role="switch"]');
			expect(button).not.toBeNull();
		});
		expect(button).not.toBeNull();
		expect(button?.getAttribute('aria-labelledby')).toBe('theme-switch-label');
		expect(button?.getAttribute('aria-checked')).toBe('false');

		await user.click(button!);

		await vi.waitFor(() => {
			expect(radiantSwitch.checked).toBe(true);
			expect(button?.getAttribute('aria-checked')).toBe('true');
		});
		expect(changeSpy).toHaveBeenCalledTimes(1);
		expect(changeSpy.mock.calls[0]?.[0]).toMatchObject({ detail: { checked: true } });
	});

	it('stays inert when disabled and falls back to an aria-label without a visible label id', async () => {
		const user = userEvent.setup();
		const changeSpy = vi.fn();
		const radiantSwitch = document.createElement('radiant-switch') as RadiantSwitch;
		radiantSwitch.setAttribute('disabled', '');
		radiantSwitch.setAttribute('label', 'Notifications');
		radiantSwitch.addEventListener('change', changeSpy);
		document.body.appendChild(radiantSwitch);

		let button: HTMLButtonElement | null = null;
		await vi.waitFor(() => {
			button = radiantSwitch.querySelector<HTMLButtonElement>('[role="switch"]');
			expect(button).not.toBeNull();
		});
		expect(button).not.toBeNull();
		expect(button?.getAttribute('aria-labelledby')).toBeNull();
		expect(button?.getAttribute('aria-label')).toBe('Notifications');

		await user.click(button!);

		expect(radiantSwitch.checked).toBe(false);
		expect(button?.getAttribute('aria-checked')).toBe('false');
		expect(changeSpy).not.toHaveBeenCalled();
	});
});