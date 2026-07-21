/** @jsxImportSource @ecopages/jsx */
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { state } from '@ecopages/radiant/decorators/state';
import type { JsxCustomElementAttributes } from '@ecopages/jsx';
import { ECOPAGES_DOCS_URL } from '../runtime/constants.ts';
import {
	parseDevToolbarPlacement,
	readDevToolbarPreferences,
	writeDevToolbarPreferences,
	type DevToolbarPlacement,
} from '../runtime/preferences.ts';

type DevToolbarHost = HTMLElement & {
	applyPreferences: (partial: { placement?: DevToolbarPlacement; stealth?: boolean }) => void;
};

const PLACEMENT_OPTIONS: Array<{ value: DevToolbarPlacement; label: string }> = [
	{ value: 'bottom', label: 'Bottom' },
	{ value: 'top', label: 'Top' },
	{ value: 'left', label: 'Left' },
	{ value: 'right', label: 'Right' },
];

@customElement('eco-dev-toolbar-settings')
export class EcoDevToolbarSettings extends RadiantElement {
	@state placement: DevToolbarPlacement = readDevToolbarPreferences().placement;
	@state stealth = readDevToolbarPreferences().stealth;

	private get toolbar(): DevToolbarHost | null {
		return this.closest('eco-dev-toolbar') as DevToolbarHost | null;
	}

	private handlePlacementChange(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLSelectElement)) {
			return;
		}

		const placement = parseDevToolbarPlacement(target.value);
		this.placement = placement;
		writeDevToolbarPreferences({ placement });
		this.toolbar?.applyPreferences({ placement });
	}

	private handleStealthChange(event: Event): void {
		const target = event.currentTarget;
		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		this.stealth = target.checked;
		writeDevToolbarPreferences({ stealth: this.stealth });
		this.toolbar?.applyPreferences({ stealth: this.stealth });
	}

	override render() {
		return (
			<section class="eco-dev-toolbar__panel">
				<header class="eco-dev-toolbar__settings-header">
					<h2>Settings</h2>
					<p class="eco-dev-toolbar__muted">Customize the Ecopages dev toolbar.</p>
				</header>

				<div class="eco-dev-toolbar__settings-section">
					<h3 class="eco-dev-toolbar__settings-title">Dock</h3>

					<label class="eco-dev-toolbar__setting-row">
						<span class="eco-dev-toolbar__setting-copy">
							<strong>Placement</strong>
							<span class="eco-dev-toolbar__muted">Where the dock appears on screen.</span>
						</span>
						<span class="eco-dev-toolbar__select-wrap">
							<select
								class="eco-dev-toolbar__select"
								value={this.placement}
								on:change={(event) => this.handlePlacementChange(event)}
							>
								{PLACEMENT_OPTIONS.map((option) => (
									<option value={option.value} selected={this.placement === option.value}>
										{option.label}
									</option>
								))}
							</select>
						</span>
					</label>

					<label class="eco-dev-toolbar__setting-row">
						<span class="eco-dev-toolbar__setting-copy">
							<strong>Stealth mode</strong>
							<span class="eco-dev-toolbar__muted">
								Hide the dock after 8s idle (4s visible, 4s fade).
							</span>
						</span>
						<span class="eco-dev-toolbar__switch">
							<input
								type="checkbox"
								checked={this.stealth}
								on:change={(event) => this.handleStealthChange(event)}
							/>
							<span class="eco-dev-toolbar__switch-track" aria-hidden="true" />
						</span>
					</label>
				</div>

				<div class="eco-dev-toolbar__settings-section">
					<h3 class="eco-dev-toolbar__settings-title">Resources</h3>
					<a
						class="eco-dev-toolbar__settings-link"
						href={ECOPAGES_DOCS_URL}
						target="_blank"
						rel="noopener noreferrer"
					>
						<span>
							<strong>Documentation</strong>
							<span class="eco-dev-toolbar__muted">Guides, API reference, and integrations.</span>
						</span>
						<span class="eco-dev-toolbar__settings-link-icon" aria-hidden="true">
							↗
						</span>
					</a>
				</div>
			</section>
		);
	}
}

declare module '@ecopages/jsx' {
	interface JsxCustomIntrinsicElements {
		'eco-dev-toolbar-settings': JsxCustomElementAttributes<EcoDevToolbarSettings>;
	}
}
