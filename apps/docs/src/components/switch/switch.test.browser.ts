import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
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
		const changeSpy = vi.fn();
		const radiantSwitch = createSwitch();
		radiantSwitch.addEventListener('change', changeSpy);
		document.body.appendChild(radiantSwitch);

		const button = await vi.waitFor(() => {
			const element = radiantSwitch.querySelector<HTMLButtonElement>('[role="switch"]');
			expect(element).not.toBeNull();
			return element!;
		});
		expect(button.getAttribute('aria-labelledby')).toBe('theme-switch-label');
		expect(button.getAttribute('aria-checked')).toBe('false');

		await userEvent.click(button);

		await vi.waitFor(() => {
			expect(radiantSwitch.checked).toBe(true);
			expect(button.getAttribute('aria-checked')).toBe('true');
		});
		expect(changeSpy).toHaveBeenCalledTimes(1);
		expect(changeSpy.mock.calls[0]?.[0]).toMatchObject({ detail: { checked: true } });
	});

	it('renders a natively disabled button and falls back to an aria-label without a visible label id', async () => {
		const radiantSwitch = document.createElement('radiant-switch') as RadiantSwitch;
		radiantSwitch.setAttribute('disabled', '');
		radiantSwitch.setAttribute('label', 'Notifications');
		document.body.appendChild(radiantSwitch);

		const button = await vi.waitFor(() => {
			const element = radiantSwitch.querySelector<HTMLButtonElement>('[role="switch"]');
			expect(element).not.toBeNull();
			return element!;
		});
		expect(button.getAttribute('aria-labelledby')).toBeNull();
		expect(button.getAttribute('aria-label')).toBe('Notifications');

		await expect.element(button).toBeDisabled();
	});
});
