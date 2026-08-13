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
	element.name = 'image-processor-install';
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
		const visibleInitialPanels = [...codeTabs.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(
			(panel) => !panel.hidden,
		);
		expect(visibleInitialPanels).toHaveLength(1);
		expect(visibleInitialPanels[0]?.textContent).toContain('console.log("ts")');
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
		const visibleSelectedPanels = [...codeTabs.querySelectorAll<HTMLElement>('[role="tabpanel"]')].filter(
			(panel) => !panel.hidden,
		);
		expect(visibleSelectedPanels).toHaveLength(1);
		expect(visibleSelectedPanels[0]?.textContent).toContain('echo bash');
		expect(changeSpy).toHaveBeenCalledTimes(1);
		expect(changeSpy.mock.calls[0]?.[0]).toMatchObject({ detail: { selectedKey: 'bash' } });
		expect(document.activeElement?.getAttribute('data-tab-value')).toBe(
			'radiant-code-tabs-image-processor-install--bash',
		);
	});

	it('copies the active tab code and exposes transient status feedback', async () => {
		const user = userEvent.setup();
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
			expect(codeTabs.querySelector('.code-tabs__status')?.textContent).toContain(
				'JavaScript copied to clipboard',
			);
		});
	});

	it('renders Shiki markup as HTML and copies its plain-text content', async () => {
		const codeTabs = document.createElement('radiant-code-tabs') as RadiantCodeTabs;
		codeTabs.tabs = [
			{
				id: 'typescript',
				label: 'example.ts',
				html: '<pre><code><span class="shiki-token">const answer = 42;</span></code></pre>',
				content: 'const answer = 42;',
			},
		];
		document.body.appendChild(codeTabs);

		await vi.waitFor(() => {
			expect(codeTabs.querySelector('.shiki-token')?.textContent).toBe('const answer = 42;');
		});
	});

	it('derives tab and panel ids from the provided name and tab ids', async () => {
		const codeTabs = createCodeTabs();
		document.body.appendChild(codeTabs);

		await vi.waitFor(() => {
			expect(codeTabs.querySelector<HTMLButtonElement>('[role="tab"]')?.id).toBe(
				'tab-radiant-code-tabs-image-processor-install--js',
			);
		});

		const activeTab = codeTabs.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
		const panel = codeTabs.querySelector<HTMLDivElement>('[role="tabpanel"]');
		expect(activeTab?.id).toBe('tab-radiant-code-tabs-image-processor-install--js');
		expect(panel?.id).toBe('panel-radiant-code-tabs-image-processor-install--js');
		expect(activeTab?.getAttribute('aria-controls')).toBe(panel?.id ?? null);
		expect(panel?.getAttribute('aria-labelledby')).toBe(activeTab?.id ?? null);
	});

	it('renders nothing after the caller clears tabs', async () => {
		const codeTabs = createCodeTabs();
		document.body.appendChild(codeTabs);

		await vi.waitFor(() => {
			expect(codeTabs.querySelector('[role="tab"]')?.textContent).toBe('JavaScript');
		});

		codeTabs.tabs = [];

		await vi.waitFor(() => {
			expect(codeTabs.querySelector('[role="tab"]')).toBeNull();
		});

		expect(codeTabs.querySelector('.code-tabs__code')).toBeNull();
	});
});
