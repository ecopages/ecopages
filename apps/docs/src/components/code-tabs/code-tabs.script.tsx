import { RadiantElement, customElement, prop, state } from '@ecopages/radiant';

/**
 * A single tab definition for the docs code-tabs custom element.
 */
export type RadiantCodeTabItem = {
	id: string;
	label: string;
	code: string;
};

/**
 * Public props for the docs code-tabs custom element.
 */
export type RadiantCodeTabsProps = {
	name: string;
	label?: string;
	tabs?: RadiantCodeTabItem[];
	copyLabel?: string;
	defaultSelectedKey?: string;
	selectedKey?: string;
};

type NonEmptyCodeTabs = [RadiantCodeTabItem, ...RadiantCodeTabItem[]];

type CodeTabsDomIds = {
	tabId: string;
	panelId: string;
};

type CodeTabsTabListProps = {
	tabs: RadiantCodeTabItem[];
	activeTabId: string;
	tabListLabel: string;
	onSelectTab: (tabId: string) => void;
	onTabKeyDown: (event: KeyboardEvent & { readonly currentTarget: HTMLButtonElement }) => void;
	getDomIds: (tabId: string) => CodeTabsDomIds;
};

type CodeTabsPanelProps = {
	activeTab: RadiantCodeTabItem;
	copyLabel: string;
	copyStatus: string;
	clipboardError: boolean;
	isCopied: boolean;
	domIds: CodeTabsDomIds;
	onCopy: () => void;
};

function CodeTabsEmptyState() {
	return (
		<div class="code-tabs">
			<p class="code-tabs__empty">No code examples available</p>
		</div>
	);
}

function CodeTabsTabList({
	tabs,
	activeTabId,
	tabListLabel,
	onSelectTab,
	onTabKeyDown,
	getDomIds,
}: CodeTabsTabListProps) {
	return (
		<div class="code-tabs__list" role="tablist" aria={{ orientation: 'horizontal', label: tabListLabel }}>
			{tabs.map((tab, index) => {
				const isSelected = tab.id === activeTabId;
				const domIds = getDomIds(tab.id);
				return (
					<button
						key={tab.id}
						type="button"
						class="code-tabs__tab"
						role="tab"
						id={domIds.tabId}
						aria-selected={isSelected}
						aria-controls={domIds.panelId}
						tabIndex={isSelected ? 0 : -1}
						data-tab-index={String(index)}
						on:click={() => {
							onSelectTab(tab.id);
						}}
						on:keydown={onTabKeyDown}
					>
						{tab.label}
					</button>
				);
			})}
		</div>
	);
}

function CodeTabsPanel({
	activeTab,
	copyLabel,
	copyStatus,
	clipboardError,
	isCopied,
	domIds,
	onCopy,
}: CodeTabsPanelProps) {
	return (
		<div class="code-tabs__panel" role="tabpanel" id={domIds.panelId} aria-labelledby={domIds.tabId}>
			<div class="code-tabs__body">
				<span class="code-tabs__code">{activeTab.code}</span>
				<button
					type="button"
					class="code-tabs__copy"
					data={{ copied: isCopied }}
					aria-label={`${copyLabel}: ${activeTab.label}`}
					on:click={onCopy}
				>
					<span class="code-tabs__icon" aria-hidden="true"></span>
				</button>
			</div>
			<span class={`code-tabs__status${clipboardError ? ' code-tabs__status--error' : ''}`} aria-live="polite">
				{copyStatus}
			</span>
		</div>
	);
}

@customElement('radiant-code-tabs')
export class RadiantCodeTabs extends RadiantElement {
	@prop({ type: String }) name = '';
	@prop({ type: String }) label = '';
	@prop({ type: Array }) tabs: RadiantCodeTabItem[] = [];
	@prop({ type: String }) copyLabel = 'Copy code';
	@prop({ type: String }) defaultSelectedKey = '';
	@prop({ type: String, reflect: true }) selectedKey = '';
	@state copiedTabId = '';
	@state copyStatus = '';
	@state clipboardError = false;

	private timeoutId: ReturnType<typeof setTimeout> | null = null;

	override disconnectedCallback(): void {
		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}

		super.disconnectedCallback();
	}

	private readonly getActiveTab = (tabs: NonEmptyCodeTabs): RadiantCodeTabItem => {
		if (this.selectedKey) {
			const selectedTab = tabs.find((tab) => tab.id === this.selectedKey);
			if (selectedTab) {
				return selectedTab;
			}
		}

		if (this.defaultSelectedKey) {
			const defaultTab = tabs.find((tab) => tab.id === this.defaultSelectedKey);
			if (defaultTab) {
				return defaultTab;
			}
		}

		return tabs[0];
	};

	private readonly getNonEmptyTabs = (): NonEmptyCodeTabs | null => {
		if (this.tabs.length === 0) {
			return null;
		}

		return this.tabs as NonEmptyCodeTabs;
	};

	private readonly normalizeIdPart = (value: string) => {
		const normalized = value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '');
		return normalized || 'code-tabs';
	};

	private readonly getInstanceIdPrefix = () => `radiant-code-tabs-${this.normalizeIdPart(this.name)}`;

	private readonly getDomIds = (instanceIdPrefix: string, tabId: string): CodeTabsDomIds => ({
		tabId: `${instanceIdPrefix}-tab-${this.normalizeIdPart(tabId)}`,
		panelId: `${instanceIdPrefix}-panel-${this.normalizeIdPart(tabId)}`,
	});

	private readonly setSelectedTab = (tabId: string) => {
		if (this.selectedKey === tabId) {
			return;
		}

		this.selectedKey = tabId;
		this.dispatchEvent(new CustomEvent('change', { detail: { selectedKey: tabId }, bubbles: true }));
	};

	private readonly focusTabAtIndex = (index: number) => {
		queueMicrotask(() => {
			this.querySelector<HTMLButtonElement>(`[data-tab-index="${String(index)}"]`)?.focus();
		});
	};

	private readonly handleTabKeyDown = (
		keyboardEvent: KeyboardEvent & { readonly currentTarget: HTMLButtonElement },
	) => {
		const validKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
		if (!validKeys.includes(keyboardEvent.key)) {
			return;
		}

		const tabs = this.getNonEmptyTabs();
		if (!tabs) {
			return;
		}
		const activeTab = this.getActiveTab(tabs);

		const activeIndex = tabs.findIndex((tab) => tab.id === activeTab.id);

		let nextIndex = activeIndex;
		switch (keyboardEvent.key) {
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIndex = (activeIndex - 1 + tabs.length) % tabs.length;
				break;
			case 'ArrowRight':
			case 'ArrowDown':
				nextIndex = (activeIndex + 1) % tabs.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = tabs.length - 1;
				break;
		}

		keyboardEvent.preventDefault();
		const nextTab = tabs[nextIndex];

		this.setSelectedTab(nextTab.id);
		this.focusTabAtIndex(nextIndex);
	};

	private readonly handleCopy = async () => {
		const tabs = this.getNonEmptyTabs();
		if (!tabs) {
			return;
		}
		const activeTab = this.getActiveTab(tabs);

		this.clipboardError = false;
		try {
			await navigator.clipboard.writeText(activeTab.code);
			this.copiedTabId = activeTab.id;
			this.copyStatus = `${activeTab.label} copied to clipboard`;
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
			}
			this.timeoutId = setTimeout(() => {
				this.copiedTabId = '';
				this.copyStatus = '';
			}, 2000);
		} catch (error) {
			console.error('Failed to copy code', error);
			this.clipboardError = true;
			this.copyStatus = `Failed to copy ${activeTab.label}`;
			if (this.timeoutId) {
				clearTimeout(this.timeoutId);
			}
			this.timeoutId = setTimeout(() => {
				this.clipboardError = false;
				this.copyStatus = '';
			}, 3000);
		}
	};

	override render() {
		const tabs = this.getNonEmptyTabs();
		if (!tabs) {
			return <CodeTabsEmptyState />;
		}

		const activeTab = this.getActiveTab(tabs);

		const instanceIdPrefix = this.getInstanceIdPrefix();
		const getDomIds = (tabId: string) => this.getDomIds(instanceIdPrefix, tabId);
		const activeDomIds = getDomIds(activeTab.id);
		const tabListLabel = this.label || 'Code examples';

		return (
			<div class="code-tabs">
				<CodeTabsTabList
					tabs={tabs}
					activeTabId={activeTab.id}
					tabListLabel={tabListLabel}
					onSelectTab={this.setSelectedTab}
					onTabKeyDown={this.handleTabKeyDown}
					getDomIds={getDomIds}
				/>
				<CodeTabsPanel
					activeTab={activeTab}
					copyLabel={this.copyLabel}
					copyStatus={this.copyStatus}
					clipboardError={this.clipboardError}
					isCopied={this.copiedTabId === activeTab.id}
					domIds={activeDomIds}
					onCopy={this.handleCopy}
				/>
			</div>
		);
	}
}
