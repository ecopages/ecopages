/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { EcoDevManifest } from './manifest-contract.ts';
import { readDevManifestFromDocument } from '../api/dev-manifest.ts';
import { DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE } from '../runtime/constants.ts';
import {
	clearNavigationTelemetryHistory,
	readNavigationTelemetrySnapshot,
	type NavigationTelemetryEntry,
	type NavigationTelemetrySnapshot,
} from '../runtime/navigation-telemetry.ts';

function formatMs(value: number | undefined): string {
	return typeof value === 'number' ? `${value}ms` : 'n/a';
}

function formatKind(entry: NavigationTelemetryEntry): string {
	if (entry.status === 'aborted') {
		return 'aborted';
	}

	return entry.kind;
}

@customElement('eco-dev-toolbar-navigation')
export class EcoDevToolbarNavigation extends RadiantElement {
	@state snapshot: NavigationTelemetrySnapshot | undefined = readNavigationTelemetrySnapshot();
	@state manifest: EcoDevManifest | undefined = readDevManifestFromDocument();
	@state historyPage = 0;

	override connectedCallback(): void {
		super.connectedCallback();
		this.ownerDocument.addEventListener('eco:page-load', this.refresh);
		this.ownerDocument.addEventListener('eco:after-swap', this.refresh);
	}

	override disconnectedCallback(): void {
		this.ownerDocument.removeEventListener('eco:page-load', this.refresh);
		this.ownerDocument.removeEventListener('eco:after-swap', this.refresh);
		super.disconnectedCallback();
	}

	refreshSnapshot(): void {
		this.refresh();
	}

	private readonly refresh = () => {
		this.manifest = readDevManifestFromDocument(this.ownerDocument);
		this.snapshot = readNavigationTelemetrySnapshot(this.ownerDocument);
		const totalPages = Math.max(
			1,
			Math.ceil((this.snapshot?.history.length ?? 0) / DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE),
		);
		if (this.historyPage > totalPages - 1) {
			this.historyPage = Math.max(0, totalPages - 1);
		}
	};

	private resetHistory(): void {
		this.snapshot = clearNavigationTelemetryHistory() ?? readNavigationTelemetrySnapshot(this.ownerDocument);
		this.historyPage = 0;
	}

	private showPreviousHistoryPage(): void {
		this.historyPage = Math.max(0, this.historyPage - 1);
	}

	private showNextHistoryPage(): void {
		const totalPages = Math.max(
			1,
			Math.ceil((this.snapshot?.history.length ?? 0) / DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE),
		);
		this.historyPage = Math.min(totalPages - 1, this.historyPage + 1);
	}

	private renderRow(entry: NavigationTelemetryEntry) {
		const routeLabel = entry.fromRoute ? `${entry.fromRoute} → ${entry.route}` : entry.route;
		const kind = formatKind(entry);

		return (
			<tr key={entry.id}>
				<td>
					{entry.status === 'aborted' ? (
						<span class="eco-dev-toolbar__status-pill" data-status="aborted">
							aborted
						</span>
					) : (
						kind
					)}
				</td>
				<td class="eco-dev-toolbar__mono">{routeLabel}</td>
				<td>{formatMs(entry.durationMs ?? entry.swapMs)}</td>
				<td>{formatMs(entry.hydrationMs)}</td>
			</tr>
		);
	}

	private renderHistoryPagination(totalEntries: number, totalPages: number) {
		if (totalEntries <= DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE) {
			return null;
		}

		const start = this.historyPage * DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE + 1;
		const end = Math.min(totalEntries, (this.historyPage + 1) * DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE);

		return (
			<div class="eco-dev-toolbar__pagination">
				<p class="eco-dev-toolbar__pagination-copy">
					Showing {start}-{end} of {totalEntries}
				</p>
				<div class="eco-dev-toolbar__pagination-actions">
					<button
						type="button"
						class="eco-dev-toolbar__pagination-button"
						disabled={this.historyPage === 0}
						on:click={() => this.showPreviousHistoryPage()}
					>
						Previous
					</button>
					<button
						type="button"
						class="eco-dev-toolbar__pagination-button"
						disabled={this.historyPage >= totalPages - 1}
						on:click={() => this.showNextHistoryPage()}
					>
						Next
					</button>
				</div>
			</div>
		);
	}

	override render() {
		const hmrConnected = Boolean((window as Window & { __ECO_HMR_CONNECTED__?: boolean }).__ECO_HMR_CONNECTED__);
		const history = [...(this.snapshot?.history ?? [])].reverse();
		const totalPages = Math.max(1, Math.ceil(history.length / DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE));
		const page = Math.min(this.historyPage, totalPages - 1);
		const rows = history.slice(
			page * DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE,
			(page + 1) * DEV_TOOLBAR_NAV_HISTORY_PAGE_SIZE,
		);
		const hasHistory = history.length > 0;

		return (
			<section class="eco-dev-toolbar__panel">
				<header class="eco-dev-toolbar__settings-header">
					<h2>Navigation</h2>
				</header>

				<dl class="eco-dev-toolbar__kv">
					<div>
						<dt>Route</dt>
						<dd>{this.snapshot?.currentRoute ?? `${window.location.pathname}${window.location.search}`}</dd>
					</div>
					<div>
						<dt>Integration</dt>
						<dd>{this.manifest?.integration ?? 'unknown'}</dd>
					</div>
					<div>
						<dt>HMR</dt>
						<dd>{hmrConnected ? 'connected' : 'disconnected'}</dd>
					</div>
					<div>
						<dt>Initial load</dt>
						<dd>{formatMs(this.snapshot?.summary.initialLoadMs)}</dd>
					</div>
					<div>
						<dt>Last navigation</dt>
						<dd>{formatMs(this.snapshot?.summary.lastNavigationMs)}</dd>
					</div>
					<div>
						<dt>Average navigation</dt>
						<dd>{formatMs(this.snapshot?.summary.averageNavigationMs)}</dd>
					</div>
					<div>
						<dt>Archive</dt>
						<dd>{this.snapshot?.summary.navigationCount ?? 0} client navigations</dd>
					</div>
				</dl>

				<div class="eco-dev-toolbar__settings-section eco-dev-toolbar__history-section">
					<div class="eco-dev-toolbar__section-header">
						<h3 class="eco-dev-toolbar__settings-title">Recent timings</h3>
						<button
							type="button"
							class="eco-dev-toolbar__pagination-button"
							disabled={!hasHistory}
							on:click={() => this.resetHistory()}
						>
							Reset
						</button>
					</div>
					{this.renderHistoryPagination(history.length, totalPages)}
					<div class="eco-dev-toolbar__table-wrap">
						<table class="eco-dev-toolbar__table">
							<thead>
								<tr>
									<th scope="col">Kind</th>
									<th scope="col">Route</th>
									<th scope="col">Duration</th>
									<th scope="col">Hydration</th>
								</tr>
							</thead>
							<tbody>
								{rows.length > 0 ? (
									rows.map((entry) => this.renderRow(entry))
								) : (
									<tr>
										<td colspan="4" class="eco-dev-toolbar__muted">
											No navigation samples yet.
										</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</div>

				<p class="eco-dev-toolbar__muted">
					Route timing, swap latency, and a machine-readable trace in <code>#__ECO_DEV_NAV_TELEMETRY__</code>.
				</p>
			</section>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'eco-dev-toolbar-navigation': JsxCustomElementAttributes<EcoDevToolbarNavigation>;
	}
}
