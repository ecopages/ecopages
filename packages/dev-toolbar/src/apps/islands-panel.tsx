/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import {
	readIslandRecords,
	resolveIslandElement,
	toIslandRecordView,
	type IslandRecordView,
} from '../islands/read-island-records.ts';
import { highlightElement } from '../runtime/highlight-element.ts';
import { subscribeToNavigationEvents } from '../runtime/navigation-events.ts';

function islandsSignature(islands: IslandRecordView[]): string {
	return islands.map((island) => `${island.id}|${island.hostTag}|${island.hydrated}|${island.kind}`).join('\n');
}

@customElement('eco-dev-toolbar-islands')
export class EcoDevToolbarIslands extends RadiantElement {
	@state islands: IslandRecordView[] = [];
	@state highlightedIndex: number | null = null;

	private refreshFrame: number | undefined;
	private mutationObserver: MutationObserver | undefined;
	private clearHighlight: (() => void) | undefined;
	private liveIslandTargets: HTMLElement[] = [];
	private suppressRefreshUntil = 0;
	private unsubscribeNavigationEvents: (() => void) | undefined;

	override connectedCallback(): void {
		super.connectedCallback();
		this.refresh();
		this.wireMutationObserver();
		this.unsubscribeNavigationEvents = subscribeToNavigationEvents(
			this.ownerDocument,
			['eco:page-load', 'eco:after-swap'],
			this.scheduleRefresh,
		);
	}

	override disconnectedCallback(): void {
		this.unsubscribeNavigationEvents?.();
		this.unsubscribeNavigationEvents = undefined;
		this.mutationObserver?.disconnect();
		this.mutationObserver = undefined;
		if (this.refreshFrame !== undefined) {
			cancelAnimationFrame(this.refreshFrame);
			this.refreshFrame = undefined;
		}
		this.resetHighlight();
		this.liveIslandTargets = [];
		super.disconnectedCallback();
	}

	private wireMutationObserver(): void {
		this.mutationObserver?.disconnect();
		this.mutationObserver = new MutationObserver(() => this.scheduleRefresh());
		this.mutationObserver.observe(this.ownerDocument.documentElement, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: [
				'data-eco-island',
				'data-eco-island-integration',
				'data-eco-component-key',
				'data-eco-component-id',
				'data-eco-props',
			],
		});
	}

	private readonly scheduleRefresh = () => {
		if (performance.now() < this.suppressRefreshUntil) {
			return;
		}

		if (this.refreshFrame !== undefined) {
			cancelAnimationFrame(this.refreshFrame);
		}

		this.refreshFrame = requestAnimationFrame(() => {
			this.refreshFrame = undefined;
			this.refresh();
		});
	};

	private refresh(): void {
		const records = readIslandRecords(this.ownerDocument);
		const nextIslands = records.map(toIslandRecordView);
		const nextTargets = records.map((record) => record.element);
		const islandsChanged = islandsSignature(nextIslands) !== islandsSignature(this.islands);

		if (islandsChanged) {
			this.resetHighlight();
			this.islands = nextIslands;
		}

		this.liveIslandTargets = nextTargets;
	}

	private resetHighlight(): void {
		this.clearHighlight?.();
		this.clearHighlight = undefined;
		this.highlightedIndex = null;
	}

	private highlightIsland(index: number): void {
		const island = this.islands[index];
		if (!island) {
			return;
		}

		let element: HTMLElement | undefined = this.liveIslandTargets[index];
		if (!(element instanceof HTMLElement) || !element.isConnected) {
			element = resolveIslandElement(island, this.ownerDocument) ?? undefined;
		}

		if (!element) {
			this.refresh();
			element = resolveIslandElement(island, this.ownerDocument) ?? undefined;
			if (!element) {
				return;
			}
		}

		const target = element;

		this.mutationObserver?.disconnect();
		this.resetHighlight();
		this.highlightedIndex = index;
		this.suppressRefreshUntil = performance.now() + 750;
		this.clearHighlight = highlightElement(target, 'island');
		this.wireMutationObserver();
	}

	override render() {
		return (
			<section class="eco-dev-toolbar__panel">
				<header class="eco-dev-toolbar__settings-header">
					<h2>Islands</h2>
					<p class="eco-dev-toolbar__muted">
						React islands, integration counters, and custom elements on this page.
					</p>
				</header>

				<p class="eco-dev-toolbar__muted">
					{this.islands.length} island{this.islands.length === 1 ? '' : 's'} on this page
				</p>
				<ul class="eco-dev-toolbar__list">
					{this.islands.length > 0 ? (
						this.islands.map((island, index) => (
							<li key={`${island.id}-${island.hostTag}-${index}`}>
								<button
									type="button"
									class="eco-dev-toolbar__list-item"
									data-highlighted={this.highlightedIndex === index ? 'true' : undefined}
									on:click={() => this.highlightIsland(index)}
								>
									<strong>{island.label}</strong>
									<span class="eco-dev-toolbar__muted">
										{island.hostTag}
										{island.integration ? ` · ${island.integration}` : ''} ·{' '}
										{island.hydrated ? 'hydrated' : 'ssr-only'} · {island.kind}
									</span>
									{island.componentKey ? (
										<span class="eco-dev-toolbar__mono">key={island.componentKey}</span>
									) : null}
									{island.propsPreview ? (
										<span class="eco-dev-toolbar__mono">{island.propsPreview}</span>
									) : null}
								</button>
							</li>
						))
					) : (
						<li class="eco-dev-toolbar__muted">No islands detected on this page.</li>
					)}
				</ul>
			</section>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'eco-dev-toolbar-islands': JsxCustomElementAttributes<EcoDevToolbarIslands>;
	}
}
