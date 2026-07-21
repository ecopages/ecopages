/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { DEV_TOOLBAR_DEPS_REFRESH_DEBOUNCE_MS } from '../runtime/constants.ts';
import { isPanelSlotVisible, observePanelSlotVisibility } from '../shell/panel-slot-visibility.ts';
import { loadDepsInsights, type AssetInsight, type DepsInsightsSnapshot } from './deps/load-deps-insights.ts';

@customElement('eco-dev-toolbar-deps')
export class EcoDevToolbarDeps extends RadiantElement {
	@state loading = true;
	@state refreshing = false;
	@state snapshot: DepsInsightsSnapshot = {
		entryCount: 0,
		chunkCount: 0,
		vendorCount: 0,
		insights: [],
	};

	private loadGeneration = 0;
	private refreshDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	private disconnectVisibilityObserver: (() => void) | undefined;

	override connectedCallback(): void {
		super.connectedCallback();
		this.ownerDocument.addEventListener('eco:page-load', this.scheduleRefresh);
		this.ownerDocument.addEventListener('eco:after-swap', this.scheduleRefresh);
		this.wireVisibilityObserver();
		void this.refresh();
	}

	override disconnectedCallback(): void {
		this.ownerDocument.removeEventListener('eco:page-load', this.scheduleRefresh);
		this.ownerDocument.removeEventListener('eco:after-swap', this.scheduleRefresh);
		this.disconnectVisibilityObserver?.();
		this.disconnectVisibilityObserver = undefined;
		if (this.refreshDebounceTimer !== undefined) {
			clearTimeout(this.refreshDebounceTimer);
			this.refreshDebounceTimer = undefined;
		}
		this.loadGeneration += 1;
		super.disconnectedCallback();
	}

	private wireVisibilityObserver(): void {
		this.disconnectVisibilityObserver?.();
		this.disconnectVisibilityObserver = observePanelSlotVisibility(this, () => {
			void this.refresh();
		});
	}

	private readonly scheduleRefresh = () => {
		if (!isPanelSlotVisible(this)) {
			return;
		}

		if (this.refreshDebounceTimer !== undefined) {
			clearTimeout(this.refreshDebounceTimer);
		}

		this.refreshDebounceTimer = setTimeout(() => {
			this.refreshDebounceTimer = undefined;
			void this.refresh();
		}, DEV_TOOLBAR_DEPS_REFRESH_DEBOUNCE_MS);
	};

	private async refresh(): Promise<void> {
		const generation = ++this.loadGeneration;
		const isInitialLoad = this.snapshot.insights.length === 0;

		if (isInitialLoad) {
			this.loading = true;
		} else {
			this.refreshing = true;
		}

		const snapshot = await loadDepsInsights(this.ownerDocument);
		if (generation !== this.loadGeneration) {
			return;
		}

		this.snapshot = snapshot;
		this.loading = false;
		this.refreshing = false;
	}

	private renderInsight(item: AssetInsight) {
		return (
			<li key={item.srcUrl}>
				<div class="eco-dev-toolbar__mono">{item.label}</div>
				<div class="eco-dev-toolbar__muted">
					{item.category}
					{item.bytes !== null ? ` · ${item.bytes} bytes` : ''}
				</div>
				{item.warning ? <div class="eco-dev-toolbar__warning">{item.warning}</div> : null}
			</li>
		);
	}

	override render() {
		return (
			<section class="eco-dev-toolbar__panel">
				<header class="eco-dev-toolbar__settings-header">
					<h2>Dependencies</h2>
					<p class="eco-dev-toolbar__muted">Page Browser Graph assets from the current route manifest.</p>
				</header>

				{this.loading ? (
					<p class="eco-dev-toolbar__muted">Loading asset sizes…</p>
				) : (
					<>
						<p class="eco-dev-toolbar__muted">
							{this.snapshot.entryCount} entry · {this.snapshot.chunkCount} chunks ·{' '}
							{this.snapshot.vendorCount} vendors
							{this.refreshing ? ' · refreshing…' : ''}
						</p>
						<ul class="eco-dev-toolbar__list">
							{this.snapshot.insights.length > 0 ? (
								this.snapshot.insights.map((item) => this.renderInsight(item))
							) : (
								<li class="eco-dev-toolbar__muted">No dependency assets in the dev manifest.</li>
							)}
						</ul>
					</>
				)}
			</section>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'eco-dev-toolbar-deps': JsxCustomElementAttributes<EcoDevToolbarDeps>;
	}
}
