/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import type { DevToolbarBadge } from '../api/types.ts';
import { toA11yBadge } from './a11y/a11y-badge.ts';
import { resolveA11yIssueElement, runA11yChecks, toA11yIssueView, type A11yIssueView } from './a11y/run-a11y-checks.ts';
import { groupA11yIssues } from './a11y/a11y-issue-groups.ts';
import { highlightElement } from '../runtime/highlight-element.ts';

const auditCache = new Map<string, A11yIssueView[]>();

function auditCacheKey(doc: Document): string {
	return doc.defaultView?.location.href ?? '';
}

function readAuditCache(doc: Document): A11yIssueView[] | undefined {
	return auditCache.get(auditCacheKey(doc));
}

function writeAuditCache(doc: Document, issues: A11yIssueView[]): void {
	auditCache.set(auditCacheKey(doc), issues);
}

function clearAuditCache(doc: Document): void {
	auditCache.delete(auditCacheKey(doc));
}

type DevToolbarHost = HTMLElement & {
	setAppBadge: (appId: string, badge: DevToolbarBadge | undefined) => void;
};

@customElement('eco-dev-toolbar-a11y')
export class EcoDevToolbarA11y extends RadiantElement {
	@state axeRunning = false;
	@state issues: A11yIssueView[] = [];
	@state highlightedGroupIndex: number | null = null;
	@state highlightedNodeIndex = 0;

	private auditGeneration = 0;
	private auditDebounceTimer: ReturnType<typeof setTimeout> | undefined;
	private clearHighlight: (() => void) | undefined;

	private get toolbar(): DevToolbarHost | null {
		return this.closest('eco-dev-toolbar') as DevToolbarHost | null;
	}

	override connectedCallback(): void {
		super.connectedCallback();
		this.ownerDocument.addEventListener('eco:page-load', this.scheduleAudit);
		this.ownerDocument.addEventListener('eco:after-swap', this.scheduleAudit);
		void this.runAudit();
	}

	override disconnectedCallback(): void {
		this.ownerDocument.removeEventListener('eco:page-load', this.scheduleAudit);
		this.ownerDocument.removeEventListener('eco:after-swap', this.scheduleAudit);
		if (this.auditDebounceTimer !== undefined) {
			clearTimeout(this.auditDebounceTimer);
			this.auditDebounceTimer = undefined;
		}
		this.auditGeneration += 1;
		this.resetHighlight();
		super.disconnectedCallback();
	}

	private readonly scheduleAudit = () => {
		clearAuditCache(this.ownerDocument);
		this.issues = [];
		this.toolbar?.setAppBadge('a11y', undefined);

		if (this.auditDebounceTimer !== undefined) {
			clearTimeout(this.auditDebounceTimer);
		}

		this.auditDebounceTimer = setTimeout(() => {
			this.auditDebounceTimer = undefined;
			void this.runAudit();
		}, 250);
	};

	private applyAuditResults(issues: A11yIssueView[], generation: number): void {
		if (generation !== this.auditGeneration) {
			return;
		}

		this.issues = issues;
		this.toolbar?.setAppBadge('a11y', toA11yBadge(issues));
	}

	private async runAudit(): Promise<void> {
		const generation = ++this.auditGeneration;
		const cached = readAuditCache(this.ownerDocument);

		this.resetHighlight();

		if (cached) {
			this.applyAuditResults(cached, generation);
			this.axeRunning = false;
			return;
		}

		this.axeRunning = true;

		try {
			const issues = await runA11yChecks(this.ownerDocument, (builtinIssues) => {
				if (generation !== this.auditGeneration) {
					return;
				}

				this.applyAuditResults(builtinIssues.map(toA11yIssueView), generation);
			});

			if (generation !== this.auditGeneration) {
				return;
			}

			const views = issues.map(toA11yIssueView);
			writeAuditCache(this.ownerDocument, views);
			this.applyAuditResults(views, generation);
		} catch {
			if (generation !== this.auditGeneration) {
				return;
			}

			this.issues = [];
			this.toolbar?.setAppBadge('a11y', undefined);
		} finally {
			if (generation === this.auditGeneration) {
				this.axeRunning = false;
			}
		}
	}

	private resetHighlight(): void {
		this.clearHighlight?.();
		this.clearHighlight = undefined;
		this.highlightedGroupIndex = null;
		this.highlightedNodeIndex = 0;
	}

	private highlightNode(groupIndex: number, nodeIndex: number): void {
		const group = groupA11yIssues(this.issues)[groupIndex];
		const issue = group?.nodes[nodeIndex];
		if (!issue) {
			return;
		}

		const element = resolveA11yIssueElement(this.ownerDocument, issue);
		if (!(element instanceof HTMLElement)) {
			return;
		}

		this.clearHighlight?.();
		this.highlightedGroupIndex = groupIndex;
		this.highlightedNodeIndex = nodeIndex;
		this.clearHighlight = highlightElement(element, 'a11y');
	}

	private cycleHighlightedNode(groupIndex: number, delta: number): void {
		const group = groupA11yIssues(this.issues)[groupIndex];
		if (!group || group.nodes.length <= 1) {
			return;
		}

		const currentIndex = this.highlightedGroupIndex === groupIndex ? this.highlightedNodeIndex : 0;
		const nextIndex = (currentIndex + delta + group.nodes.length) % group.nodes.length;
		this.highlightNode(groupIndex, nextIndex);
	}

	private renderIssuePagination(groupIndex: number, nodeCount: number) {
		if (nodeCount <= 1) {
			return null;
		}

		const activeIndex = this.highlightedGroupIndex === groupIndex ? this.highlightedNodeIndex : 0;

		return (
			<div
				class="eco-dev-toolbar__pagination eco-dev-toolbar__issue-pagination"
				on:click={(event) => event.stopPropagation()}
			>
				<p class="eco-dev-toolbar__pagination-copy">
					Element {activeIndex + 1} of {nodeCount}
				</p>
				<div class="eco-dev-toolbar__pagination-actions">
					<button
						type="button"
						class="eco-dev-toolbar__pagination-button"
						on:click={() => this.cycleHighlightedNode(groupIndex, -1)}
					>
						Previous
					</button>
					<button
						type="button"
						class="eco-dev-toolbar__pagination-button"
						on:click={() => this.cycleHighlightedNode(groupIndex, 1)}
					>
						Next
					</button>
				</div>
			</div>
		);
	}

	override render() {
		const axeCount = this.issues.filter((issue) => issue.source === 'axe').length;
		const issueGroups = groupA11yIssues(this.issues);

		return (
			<section class="eco-dev-toolbar__panel">
				<header class="eco-dev-toolbar__settings-header">
					<h2>Accessibility</h2>
					<p class="eco-dev-toolbar__muted">
						axe-core and built-in checks for the current page. Click a row to highlight a node; use
						Previous/Next when an issue affects multiple elements.
					</p>
				</header>

				{this.issues.length > 0 || !this.axeRunning ? (
					<>
						<p class="eco-dev-toolbar__muted">
							{this.issues.length} issue{this.issues.length === 1 ? '' : 's'} found
							{issueGroups.length !== this.issues.length
								? ` · ${issueGroups.length} rule${issueGroups.length === 1 ? '' : 's'}`
								: ''}
							{axeCount > 0 ? ` · ${axeCount} from axe-core` : ''}
						</p>
						<ul class="eco-dev-toolbar__list">
							{issueGroups.length > 0 ? (
								issueGroups.map((group, groupIndex) => (
									<li
										key={`${group.source}-${group.id}-${group.message}`}
										class="eco-dev-toolbar__list-entry"
									>
										<button
											type="button"
											class="eco-dev-toolbar__list-item"
											data-highlighted={
												this.highlightedGroupIndex === groupIndex ? 'true' : undefined
											}
											on:click={() =>
												this.highlightNode(
													groupIndex,
													this.highlightedGroupIndex === groupIndex
														? this.highlightedNodeIndex
														: 0,
												)
											}
										>
											<strong>{group.severity}</strong>
											<span class="eco-dev-toolbar__muted">
												{group.source} · {group.id}
												{group.nodes.length > 1 ? ` · ${group.nodes.length} elements` : ''}
											</span>
											<span class="eco-dev-toolbar__mono">{group.message}</span>
										</button>
										{this.renderIssuePagination(groupIndex, group.nodes.length)}
									</li>
								))
							) : (
								<li class="eco-dev-toolbar__muted">No accessibility issues found.</li>
							)}
						</ul>
					</>
				) : null}

				{this.axeRunning ? <p class="eco-dev-toolbar__muted">Running axe-core audit…</p> : null}
			</section>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'eco-dev-toolbar-a11y': JsxCustomElementAttributes<EcoDevToolbarA11y>;
	}
}
