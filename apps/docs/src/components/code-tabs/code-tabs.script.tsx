import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { unsafeHtml } from '@ecopages/jsx/jsx-runtime';
import { RuiButton } from '@ecopages/radiant-ui/button';
import { RuiTabs } from '@ecopages/radiant-ui/tabs';
import { RadiantElement, customElement, onEvent, prop, state } from '@ecopages/radiant';
import { renderTabLabel } from './code-tab-icons';

/**
 * Plain-text tabs escape `code`. Rich tabs pass highlighted HTML in `html` and
 * clipboard text in `content` — strings survive host-attribute JSON round-trips;
 * JSX/`unsafeHtml` brands do not.
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
			html: string;
			content: string;
	  };

export type RadiantCodeTabsProps = {
	name?: string;
	label?: string;
	tabs?: RadiantCodeTabItem[];
	copyLabel?: string;
	defaultSelectedKey?: string;
	selectedKey?: string;
};

function isRichTab(tab: RadiantCodeTabItem): tab is Extract<RadiantCodeTabItem, { html: string; content: string }> {
	return 'html' in tab;
}

function tabClipboardText(tab: RadiantCodeTabItem): string {
	return isRichTab(tab) ? tab.content : tab.code;
}

/**
 * Docs-specific code presentation that delegates tab selection and keyboard
 * interaction to `RuiTabs` while retaining code-copying behavior.
 */
@customElement('radiant-code-tabs')
export class RadiantCodeTabs extends RadiantElement {
	@prop({ type: String, reflect: true }) name = '';
	@prop({ type: Array }) tabs: RadiantCodeTabItem[] = [];
	@prop({ type: String }) label = '';
	@prop({ type: String }) copyLabel = 'Copy code';
	@prop({ type: String }) defaultSelectedKey = '';
	@prop({ type: String, reflect: true }) selectedKey = '';
	@state copyStatus = '';

	private static nextInstanceId = 0;
	private readonly instanceId = `radiant-code-tabs-${++RadiantCodeTabs.nextInstanceId}`;

	private resolveTabs(): RadiantCodeTabItem[] {
		if (Array.isArray(this.tabs) && this.tabs.length > 0) {
			return this.tabs;
		}

		const tabsAttribute = this.getAttribute('tabs');
		if (!tabsAttribute) {
			return [];
		}

		try {
			const parsed = JSON.parse(tabsAttribute) as unknown;
			return Array.isArray(parsed) ? (parsed as RadiantCodeTabItem[]) : [];
		} catch {
			return [];
		}
	}

	private handleCopy = async (tab: RadiantCodeTabItem): Promise<void> => {
		try {
			await navigator.clipboard.writeText(tabClipboardText(tab));
			this.copyStatus = `${tab.label} copied to clipboard`;
		} catch (error) {
			console.error('Failed to copy code', error);
		}
	};

	private getIdBase(): string {
		const normalizedName = this.name
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, '-');
		return normalizedName ? `radiant-code-tabs-${normalizedName}` : this.instanceId;
	}

	private getTabId(tabId: string): string {
		return `${this.getIdBase()}-tab-${tabId}`;
	}

	private getPanelId(tabId: string): string {
		return `${this.getIdBase()}-panel-${tabId}`;
	}

	@onEvent({ selector: 'rui-tabs', type: 'rui-change' })
	onTabChange(event: Event): void {
		const detail = (event as CustomEvent<{ value?: string }>).detail;
		if (detail?.value) {
			this.selectedKey = detail.value;
			this.dispatchEvent(new CustomEvent('change', { detail: { selectedKey: detail.value }, bubbles: true }));
		}
	}

	override render() {
		const tabs = this.resolveTabs();
		if (tabs.length === 0) {
			return null;
		}

		const requestedSelectedKey = this.selectedKey || this.defaultSelectedKey;
		const selectedKey = tabs.some((tab) => tab.id === requestedSelectedKey) ? requestedSelectedKey : tabs[0]?.id;
		const tabListLabel = this.label || 'Code examples';

		return (
			<RuiTabs variant="boxed" value={selectedKey} label={tabListLabel}>
				<div class="rui-tabs__list code-tabs__list" role="tablist" aria-label={tabListLabel}>
					{tabs.map((tab, index) => {
						const isSelected = tab.id === selectedKey;

						return (
							<button
								type="button"
								class="rui-tabs__tab code-tabs__tab"
								role="tab"
								id={this.getTabId(tab.id)}
								data-tab-value={tab.id}
								data-tab-index={String(index)}
								aria-controls={this.getPanelId(tab.id)}
								aria-selected={isSelected}
								tabIndex={isSelected ? 0 : -1}
							>
								{renderTabLabel({
									id: tab.id,
									label: tab.label,
									code: tabClipboardText(tab),
								})}
							</button>
						);
					})}
				</div>
				<div class="rui-tabs__panels">
					{tabs.map((tab) => (
						<div
							class="rui-tabs__panel code-tabs__panel"
							role="tabpanel"
							id={this.getPanelId(tab.id)}
							data-tab-value={tab.id}
							aria-labelledby={this.getTabId(tab.id)}
							tabIndex={0}
							hidden={tab.id !== selectedKey}
						>
							<div class="code-tabs__body">
								<span class="code-tabs__code">{isRichTab(tab) ? unsafeHtml(tab.html) : tab.code}</span>
								<RuiButton
									size="sm"
									variant="ghost"
									class="code-tabs__copy"
									aria-label={`${this.copyLabel}: ${tab.label}`}
									on:click={() => void this.handleCopy(tab)}
								>
									<span aria-hidden="true">Copy</span>
								</RuiButton>
							</div>
						</div>
					))}
				</div>
				<span class="code-tabs__status" aria-live="polite">
					{this.copyStatus}
				</span>
			</RuiTabs>
		);
	}
}

declare module '@ecopages/jsx/jsx-runtime' {
	interface JsxCustomIntrinsicElements {
		'radiant-code-tabs': JsxCustomElementAttributes<RadiantCodeTabs, RadiantCodeTabsProps>;
	}
}
