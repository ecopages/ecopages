import type { JsxNodeLike, JsxRenderable } from '@ecopages/jsx/jsx-runtime';
import { RadiantElement } from '@ecopages/radiant/core/radiant-element';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onUpdated } from '@ecopages/radiant/decorators/on-updated';
import { prop } from '@ecopages/radiant/decorators/prop';
import { state } from '@ecopages/radiant/decorators/state';

/**
 * A single tab definition for the docs code-tabs custom element.
 */
export type RadiantCodeTabItem =
	| {
			id: string;
			label: string;
			code: string;
	  }
	| {
			id: string;
			label: string;
			code: JsxNodeLike | JsxRenderable;
			content: string;
	  };

/**
 * Public props for the docs code-tabs custom element.
 */
export type RadiantCodeTabsProps = {
	name?: string;
	label?: string;
	tabs?: RadiantCodeTabItem[];
	copyLabel?: string;
	defaultSelectedKey?: string;
	selectedKey?: string;
};

@customElement('radiant-code-tabs')
export class RadiantCodeTabs extends RadiantElement {
	@prop({ type: String, reflect: true }) name = '';
	@prop({ type: String }) label = '';
	@prop({ type: Array }) tabs: RadiantCodeTabItem[] = [];
	@prop({ type: String }) copyLabel = 'Copy code';
	@prop({ type: String }) defaultSelectedKey = '';
	@prop({ type: String, reflect: true }) selectedKey = '';
	@state copiedTabId = '';
	@state copyStatus = '';

	private static nextInstanceId = 0;
	private readonly instanceId = `radiant-code-tabs-${++RadiantCodeTabs.nextInstanceId}`;
	private timeoutId: ReturnType<typeof setTimeout> | null = null;
	private tabMetricsFrameId: number | null = null;
	private resizeObserver: ResizeObserver | null = null;

	override connectedCallback(): void {
		super.connectedCallback();
		this.scheduleTabMetricsSync();

		if (typeof ResizeObserver === 'undefined') {
			return;
		}

		this.resizeObserver ??= new ResizeObserver(() => {
			this.scheduleTabMetricsSync();
		});
		this.resizeObserver.observe(this);
	}

	override disconnectedCallback(): void {
		if (this.tabMetricsFrameId !== null) {
			cancelAnimationFrame(this.tabMetricsFrameId);
			this.tabMetricsFrameId = null;
		}

		this.resizeObserver?.disconnect();

		if (this.timeoutId) {
			clearTimeout(this.timeoutId);
			this.timeoutId = null;
		}

		super.disconnectedCallback();
	}

	private readonly resolveTabs = (): RadiantCodeTabItem[] => {
		return Array.isArray(this.tabs) ? this.tabs : [];
	};

	private readonly sanitizeIdPart = (value: string): string => {
		const sanitized = value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-')
			.replace(/^-+|-+$/g, '');

		return sanitized || this.instanceId;
	};

	private readonly getIdBase = (): string => {
		return this.name ? `radiant-code-tabs-${this.sanitizeIdPart(this.name)}` : this.instanceId;
	};

	private readonly getTabId = (tabId: string): string => {
		return `${this.getIdBase()}-tab-${this.sanitizeIdPart(tabId)}`;
	};

	private readonly getPanelId = (tabId: string): string => {
		return `${this.getIdBase()}-panel-${this.sanitizeIdPart(tabId)}`;
	};

	private readonly scheduleTabMetricsSync = () => {
		if (this.tabMetricsFrameId !== null) {
			cancelAnimationFrame(this.tabMetricsFrameId);
		}

		this.tabMetricsFrameId = requestAnimationFrame(() => {
			this.tabMetricsFrameId = null;
			this.syncTabMetrics();
		});
	};

	private readonly syncTabMetrics = () => {
		const tabButtons = Array.from(this.querySelectorAll<HTMLButtonElement>('.code-tabs__tab'));
		if (tabButtons.length === 0) {
			this.style.removeProperty('--code-tabs-tab-width');
			this.style.removeProperty('--code-tabs-tab-height');
			this.style.removeProperty('--code-tabs-panel-width');
			this.style.removeProperty('--code-tabs-panel-height');
			return;
		}

		const measurementRoot = document.createElement('div');
		measurementRoot.className = 'code-tabs__measure';
		measurementRoot.style.setProperty('--code-tabs-tab-width', 'auto');
		measurementRoot.style.setProperty('--code-tabs-tab-height', 'auto');

		for (const tabButton of tabButtons) {
			const clonedTabButton = tabButton.cloneNode(true) as HTMLButtonElement;
			clonedTabButton.removeAttribute('id');
			clonedTabButton.removeAttribute('aria-controls');
			clonedTabButton.setAttribute('aria-selected', 'true');
			clonedTabButton.tabIndex = -1;
			measurementRoot.append(clonedTabButton);
		}

		this.append(measurementRoot);

		let maxWidth = 0;
		let maxHeight = 0;
		for (const tabButton of measurementRoot.querySelectorAll<HTMLButtonElement>('.code-tabs__tab')) {
			const { width, height } = tabButton.getBoundingClientRect();
			maxWidth = Math.max(maxWidth, Math.ceil(width));
			maxHeight = Math.max(maxHeight, Math.ceil(height));
		}

		measurementRoot.remove();

		this.style.setProperty('--code-tabs-tab-width', `${String(maxWidth)}px`);
		this.style.setProperty('--code-tabs-tab-height', `${String(maxHeight)}px`);

		const measuredPanels = Array.from(this.querySelectorAll<HTMLElement>('.code-tabs__measure-panel'));
		let maxPanelWidth = 0;
		let maxPanelHeight = 0;
		for (const measuredPanel of measuredPanels) {
			const { width, height } = measuredPanel.getBoundingClientRect();
			maxPanelWidth = Math.max(maxPanelWidth, Math.ceil(width));
			maxPanelHeight = Math.max(maxPanelHeight, Math.ceil(height));
		}

		if (maxPanelWidth > 0) {
			this.style.setProperty('--code-tabs-panel-width', `${String(maxPanelWidth)}px`);
		}

		if (maxPanelHeight > 0) {
			this.style.setProperty('--code-tabs-panel-height', `${String(maxPanelHeight)}px`);
		}
	};

	@onUpdated(['tabs', 'selectedKey'])
	private handleTabMetricsDependenciesChanged(): void {
		this.scheduleTabMetricsSync();
	}

	private readonly getActiveTab = (tabs: RadiantCodeTabItem[]): RadiantCodeTabItem | null => {
		if (tabs.length === 0) {
			return null;
		}

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

		return tabs[0] ?? null;
	};

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
		const tabs = this.resolveTabs();
		const activeTab = this.getActiveTab(tabs);
		if (!activeTab) {
			return;
		}

		const activeIndex = tabs.findIndex((tab) => tab.id === activeTab.id);
		if (activeIndex === -1) {
			return;
		}

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
			default:
				return;
		}

		keyboardEvent.preventDefault();
		const nextTab = tabs[nextIndex];
		if (!nextTab) {
			return;
		}

		this.setSelectedTab(nextTab.id);
		this.focusTabAtIndex(nextIndex);
	};

	private readonly handleCopy = async () => {
		const activeTab = this.getActiveTab(this.resolveTabs());
		if (!activeTab) {
			return;
		}

		try {
			const content = 'content' in activeTab ? activeTab.content : activeTab.code;
			await navigator.clipboard.writeText(content);
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
		}
	};

	override render() {
		const tabs = this.resolveTabs();
		const activeTab = this.getActiveTab(tabs);
		if (!activeTab) {
			return null;
		}

		const tabListLabel = this.label || 'Code examples';
		const tabId = this.getTabId(activeTab.id);
		const panelId = this.getPanelId(activeTab.id);

		return (
			<div class="code-tabs">
				<div class="code-tabs__list" role="tablist" aria-label={tabListLabel} aria-orientation="horizontal">
					{tabs.map((tab, index) => {
						const isSelected = tab.id === activeTab.id;
						return (
							<button
								key={tab.id}
								type="button"
								class="code-tabs__tab"
								role="tab"
								id={this.getTabId(tab.id)}
								aria-selected={isSelected}
								aria-controls={this.getPanelId(tab.id)}
								tabIndex={isSelected ? 0 : -1}
								data-tab-index={String(index)}
								on:click={() => {
									this.setSelectedTab(tab.id);
								}}
								on:keydown={this.handleTabKeyDown}
							>
								{tab.label}
							</button>
						);
					})}
				</div>
				<div class="code-tabs__panel" role="tabpanel" id={panelId} aria-labelledby={tabId}>
					<div class="code-tabs__body">
						<span class="code-tabs__code">{activeTab.code}</span>
						<button
							type="button"
							class="code-tabs__copy"
							data={{ copied: this.copiedTabId === activeTab.id }}
							aria-label={`${this.copyLabel}: ${activeTab.label}`}
							on:click={this.handleCopy}
						>
							<span class="code-tabs__icon" aria-hidden="true"></span>
						</button>
					</div>
					<span class="code-tabs__status" aria-live="polite">
						{this.copyStatus}
					</span>
				</div>
				<div class="code-tabs__measure" aria-hidden="true">
					{tabs.map((tab) => {
						return (
							<div class="code-tabs__measure-panel" key={`measure-${tab.id}`}>
								<div class="code-tabs__body">
									<span class="code-tabs__code">{tab.code}</span>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		);
	}
}
