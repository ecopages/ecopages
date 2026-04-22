import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { RadiantCodeTabs } from './code-tabs.script';

function resetDom(): void {
	document.body.innerHTML = '';
	vi.restoreAllMocks();
	vi.useRealTimers();
}

function createCodeTabs(): RadiantCodeTabs {
	const element = document.createElement('radiant-code-tabs') as RadiantCodeTabs;
	element.label = 'Code examples';
	element.copyLabel = 'Copy code';
	element.tabs = [
		{ id: 'js', label: 'JavaScript', code: 'console.log("js")' },
		{ id: 'ts', label: 'TypeScript', code: 'console.log("ts")' },
		{ id: 'bash', label: 'Bash', code: 'echo bash' },
	];
	return element;
}

describe('RadiantCodeTabs', () => {
	beforeEach(() => {
		resetDom();
	});

	afterEach(() => {
		resetDom();
	});

	it('switches tabs with keyboard navigation and emits change events', async () => {
		const changeSpy = vi.fn();
		const codeTabs = createCodeTabs();
		codeTabs.defaultSelectedKey = 'ts';
		codeTabs.addEventListener('change', changeSpy);
		document.body.appendChild(codeTabs);

		await vi.waitFor(() => {
			const selectedTab = codeTabs.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
			expect(selectedTab?.textContent).toBe('TypeScript');
		});
		const selectedTab = codeTabs.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
		expect(selectedTab).not.toBeNull();
		if (!selectedTab) {
			throw new Error('Expected an active code tab to be rendered');
		}

		selectedTab.focus();
		selectedTab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));

		await vi.waitFor(() => {
			expect(codeTabs.selectedKey).toBe('bash');
			expect(codeTabs.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Bash');
		});
		expect(changeSpy).toHaveBeenCalledTimes(1);
		expect(changeSpy.mock.calls[0]?.[0]).toMatchObject({ detail: { selectedKey: 'bash' } });
		expect(document.activeElement?.getAttribute('data-tab-index')).toBe('2');
	});

	it('copies the active tab code and exposes transient status feedback', async () => {
		vi.useFakeTimers();
		const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText },
		});
		const codeTabs = createCodeTabs();
		codeTabs.selectedKey = 'js';
		document.body.appendChild(codeTabs);

		let copyButton: HTMLButtonElement | null = null;
		await vi.waitFor(() => {
			copyButton = codeTabs.querySelector<HTMLButtonElement>('.code-tabs__copy');
			expect(copyButton).not.toBeNull();
		});
		expect(copyButton).not.toBeNull();

		await user.click(copyButton!);

		await vi.waitFor(() => {
			expect(writeText).toHaveBeenCalledWith('console.log("js")');
			expect(codeTabs.querySelector('.code-tabs__status')?.textContent).toContain('JavaScript copied to clipboard');
			expect(codeTabs.querySelector('.code-tabs__copy')?.getAttribute('data-copied')).toBe('true');
		});

		vi.advanceTimersByTime(2000);

		await vi.waitFor(() => {
			expect(codeTabs.querySelector('.code-tabs__status')?.textContent?.trim()).toBe('');
			expect(codeTabs.querySelector('.code-tabs__copy')?.getAttribute('data-copied')).toBe('false');
		});
	});
});