/** @jsxImportSource @ecopages/jsx */
import '@ecopages/radiant/client/install-hydrator';
import { RadiantElement } from '@ecopages/radiant';
import { customElement } from '@ecopages/radiant/decorators/custom-element';
import { onUpdated } from '@ecopages/radiant/decorators/on-updated';
import { query } from '@ecopages/radiant/decorators/query';
import { state } from '@ecopages/radiant/decorators/state';
import '../apps/a11y-panel.tsx';
import '../apps/deps-panel.tsx';
import '../apps/islands-panel.tsx';
import '../apps/navigation-panel.tsx';
import '../apps/settings-panel.tsx';
import { readDevManifestFromDocument, updateDevManifestInDocument, type EcoDevManifest } from '../api/dev-manifest.ts';
import type { DevToolbarBadge } from '../api/types.ts';
import { DEV_TOOLBAR_ELEMENT_NAME, DEV_TOOLBAR_PERSIST_KEY } from '../runtime/constants.ts';
import {
	readDevToolbarPreferences,
	writeDevToolbarPreferences,
	type DevToolbarPlacement,
} from '../runtime/preferences.ts';
import { A11yIcon, DepsIcon, IslandsIcon, NavigationIcon, SettingsIcon } from './icons.tsx';
import { badgesEqual } from './badges.ts';
import { DevToolbarLegacyAppHost } from './legacy-app-host.ts';
import { DevToolbarNavigationLoading } from './navigation-loading.ts';
import { DevToolbarStealthController, type StealthPhase } from './stealth-controller.ts';
import type { EcoDevToolbarNavigation } from '../apps/navigation-panel.tsx';

const BUILT_IN_APPS = [
	{ id: 'navigation', label: 'Navigation' },
	{ id: 'deps', label: 'Deps' },
	{ id: 'islands', label: 'Islands' },
	{ id: 'a11y', label: 'A11y' },
	{ id: 'settings', label: 'Settings' },
] as const;

const RADIANT_APP_IDS = new Set<string>(BUILT_IN_APPS.map((app) => app.id));

@customElement(DEV_TOOLBAR_ELEMENT_NAME)
export class EcoDevToolbar extends RadiantElement {
	@state placement: DevToolbarPlacement = readDevToolbarPreferences().placement;
	@state stealthEnabled = readDevToolbarPreferences().stealth;
	@state stealthPhase: StealthPhase = readDevToolbarPreferences().stealth ? 'hidden' : 'visible';
	@state hovered = false;
	@state panelOpen = false;
	@state activeAppId: string | null = null;
	@state badges: Record<string, DevToolbarBadge | undefined> = {};
	@state loadingApps: Record<string, boolean> = {};
	@state mountedAppIds: string[] = [];
	/** Optional dock apps from the reference-toolbar internal registry (`window.__ECO_DEV_TOOLBAR_APPS__`). */
	@state extensionApps: Array<{ id: string; label: string }> = [];

	@query({ ref: 'legacyPanel' }) legacyPanel?: HTMLElement;

	private cleanupActiveApp: (() => void) | undefined;
	private documentListenersWired = false;
	private readonly routeListeners = new Set<() => void>();
	private readonly legacyAppHost = new DevToolbarLegacyAppHost();
	private readonly stealthController: DevToolbarStealthController;
	private readonly navigationLoading: DevToolbarNavigationLoading;

	constructor() {
		super();

		this.stealthController = new DevToolbarStealthController({
			onPhaseChange: (phase) => {
				this.stealthPhase = phase;
			},
			isPanelOpen: () => this.panelOpen,
			isEnabled: () => this.stealthEnabled,
			getShellElement: () => this.getRef('shell') as HTMLElement | null,
			getPlacement: () => this.placement,
		});

		this.navigationLoading = new DevToolbarNavigationLoading({
			onLoadingChange: (appId, loading) => {
				if (!loading) {
					if (!this.loadingApps[appId]) {
						return;
					}

					const next = { ...this.loadingApps };
					delete next[appId];
					this.loadingApps = next;
					return;
				}

				this.loadingApps = { ...this.loadingApps, [appId]: true };
			},
		});
	}

	static mount(): EcoDevToolbar {
		let host = document.querySelector<EcoDevToolbar>(DEV_TOOLBAR_ELEMENT_NAME);
		if (!host) {
			host = document.createElement(DEV_TOOLBAR_ELEMENT_NAME) as EcoDevToolbar;
			host.setAttribute('data-eco-persist', DEV_TOOLBAR_PERSIST_KEY);
			document.documentElement.append(host);
		}

		return host;
	}

	override connectedCallback(): void {
		super.connectedCallback();
		const panelShell = this.querySelector('.eco-dev-toolbar__panel-shell');
		if (panelShell instanceof HTMLElement) {
			panelShell.removeAttribute('style');
		}

		this.legacyAppHost.registerFromWindow();
		this.extensionApps = this.legacyAppHost.listApps().map((app) => ({ id: app.id, label: app.label }));
		this.wireDocumentListeners();

		if (this.stealthEnabled) {
			this.stealthController.setPhase('hidden');
		}
	}

	override disconnectedCallback(): void {
		this.unwireDocumentListeners();
		this.stealthController.clearTimers();
		this.navigationLoading.clear();
		this.cleanupActiveApp?.();
		this.cleanupActiveApp = undefined;
		super.disconnectedCallback();
	}

	setAppBadge(appId: string, badge: DevToolbarBadge | undefined): void {
		const current = this.badges[appId];
		if (badgesEqual(current, badge)) {
			return;
		}

		if (badge === undefined) {
			const next = { ...this.badges };
			delete next[appId];
			this.badges = next;
			return;
		}

		this.badges = { ...this.badges, [appId]: badge };
	}

	notifyRouteChange(manifest?: EcoDevManifest): void {
		if (manifest) {
			updateDevManifestInDocument(manifest);
		}

		this.navigationLoading.end();
		this.closePanel();

		for (const listener of this.routeListeners) {
			listener();
		}

		this.querySelector<EcoDevToolbarNavigation>('eco-dev-toolbar-navigation')?.refreshSnapshot();
	}

	applyPreferences(partial: { placement?: DevToolbarPlacement; stealth?: boolean }): void {
		const next = writeDevToolbarPreferences(partial);
		this.placement = next.placement;
		this.stealthEnabled = next.stealth;

		if (!next.stealth) {
			this.stealthController.clearTimers();
			this.stealthController.setPhase('visible');
			return;
		}

		if (!this.panelOpen) {
			this.stealthController.schedule();
		}
	}

	private handleShellEnter(): void {
		this.hovered = true;
		this.stealthController.reveal();
	}

	private handleShellLeave(event: MouseEvent): void {
		this.handlePointerLeave(event);
	}

	private handleShellClick(): void {
		if (!this.stealthEnabled || this.panelOpen || this.stealthPhase !== 'hidden') {
			return;
		}

		this.hovered = true;
		this.stealthController.reveal();
	}

	private handlePointerLeave(event: MouseEvent): void {
		const related = event.relatedTarget;
		if (related instanceof Node && this.contains(related)) {
			return;
		}

		this.hovered = false;
		if (!this.panelOpen) {
			this.stealthController.schedule();
		}
	}

	@onUpdated('activeAppId')
	private mountLegacyPanelWhenNeeded(): void {
		this.cleanupActiveApp?.();
		this.cleanupActiveApp = undefined;

		if (!this.activeAppId || RADIANT_APP_IDS.has(this.activeAppId) || !this.legacyPanel) {
			return;
		}

		const cleanup = this.legacyAppHost.mount(this.activeAppId, this.legacyPanel, {
			onBadgeChange: (appId, badge) => this.setAppBadge(appId, badge),
			onRouteListener: (listener) => {
				this.routeListeners.add(listener);
				return () => this.routeListeners.delete(listener);
			},
		});

		if (cleanup) {
			this.cleanupActiveApp = cleanup;
		}
	}

	private wireDocumentListeners(): void {
		if (this.documentListenersWired) {
			return;
		}

		document.addEventListener('click', this.handleOutsideClick, true);
		document.addEventListener('eco:before-swap', this.handleNavigationStart);
		document.addEventListener('eco:after-swap', this.handleNavigationEnd);
		document.addEventListener('eco:page-load', this.handleNavigationEnd);
		document.addEventListener('eco:page-load', this.handleRouteChange);
		document.addEventListener('eco:after-swap', this.handleRouteChange);
		this.documentListenersWired = true;
	}

	private unwireDocumentListeners(): void {
		if (!this.documentListenersWired) {
			return;
		}

		document.removeEventListener('click', this.handleOutsideClick, true);
		document.removeEventListener('eco:before-swap', this.handleNavigationStart);
		document.removeEventListener('eco:after-swap', this.handleNavigationEnd);
		document.removeEventListener('eco:page-load', this.handleNavigationEnd);
		document.removeEventListener('eco:page-load', this.handleRouteChange);
		document.removeEventListener('eco:after-swap', this.handleRouteChange);
		this.documentListenersWired = false;
	}

	private readonly handleOutsideClick = (event: MouseEvent) => {
		if (!this.panelOpen || event.composedPath().includes(this)) {
			return;
		}

		this.closePanel();
	};

	private readonly handleNavigationStart = () => {
		this.navigationLoading.begin();
	};

	private readonly handleNavigationEnd = () => {
		this.navigationLoading.end();
	};

	private readonly handleRouteChange = () => {
		this.notifyRouteChange();
	};

	private toggleApp(appId: string): void {
		if (this.activeAppId === appId) {
			this.closePanel();
			return;
		}

		this.openApp(appId);
	}

	private openApp(appId: string): void {
		this.cleanupActiveApp?.();
		this.cleanupActiveApp = undefined;
		if (RADIANT_APP_IDS.has(appId) && !this.mountedAppIds.includes(appId)) {
			this.mountedAppIds = [...this.mountedAppIds, appId];
		}
		this.activeAppId = appId;
		this.panelOpen = true;
		this.stealthController.reveal();
	}

	private closePanel(): void {
		if (!this.panelOpen) {
			return;
		}

		this.cleanupActiveApp?.();
		this.cleanupActiveApp = undefined;
		this.activeAppId = null;
		this.panelOpen = false;
		this.stealthController.schedule();
	}

	private renderAppIcon(appId: string) {
		const loading = this.loadingApps[appId] === true;
		switch (appId) {
			case 'navigation':
				return <NavigationIcon loading={loading} />;
			case 'deps':
				return <DepsIcon />;
			case 'islands':
				return <IslandsIcon />;
			case 'a11y':
				return <A11yIcon />;
			case 'settings':
				return <SettingsIcon />;
			default:
				return <span class="eco-dev-toolbar__icon-text">{appId.slice(0, 1).toUpperCase()}</span>;
		}
	}

	private renderDockButton(app: { id: string; label: string }) {
		const pressed = this.activeAppId === app.id;
		const loading = this.loadingApps[app.id] === true;
		const badge = this.badges[app.id];

		return (
			<button
				key={app.id}
				type="button"
				class="eco-dev-toolbar__button"
				title={app.label}
				aria-label={app.label}
				aria-pressed={pressed}
				aria-busy={loading}
				data-loading={loading ? 'true' : undefined}
				on:click={() => this.toggleApp(app.id)}
			>
				{this.renderAppIcon(app.id)}
				{badge?.count ? (
					<span class="eco-dev-toolbar__badge" data-severity={badge.severity}>
						{badge.count}
					</span>
				) : null}
			</button>
		);
	}

	private renderRadiantPanelSlot(appId: string) {
		const visible = this.panelOpen && this.activeAppId === appId;

		switch (appId) {
			case 'navigation':
				return (
					<div key={appId} class="eco-dev-toolbar__panel-slot" hidden={!visible}>
						<eco-dev-toolbar-navigation />
					</div>
				);
			case 'deps':
				return (
					<div key={appId} class="eco-dev-toolbar__panel-slot" hidden={!visible}>
						<eco-dev-toolbar-deps />
					</div>
				);
			case 'islands':
				return (
					<div key={appId} class="eco-dev-toolbar__panel-slot" hidden={!visible}>
						<eco-dev-toolbar-islands />
					</div>
				);
			case 'a11y':
				return (
					<div key={appId} class="eco-dev-toolbar__panel-slot" hidden={!visible}>
						<eco-dev-toolbar-a11y />
					</div>
				);
			case 'settings':
				return (
					<div key={appId} class="eco-dev-toolbar__panel-slot" hidden={!visible}>
						<eco-dev-toolbar-settings />
					</div>
				);
			default:
				return null;
		}
	}

	private renderLegacyPanel() {
		if (!this.panelOpen || !this.activeAppId || RADIANT_APP_IDS.has(this.activeAppId)) {
			return null;
		}

		return <div data-ref="legacyPanel" class="eco-dev-toolbar__panel-slot" />;
	}

	private renderActivePanel() {
		const radiantSlots = this.mountedAppIds.map((appId) => this.renderRadiantPanelSlot(appId));
		const legacyPanel = this.renderLegacyPanel();

		if (radiantSlots.length === 0 && !legacyPanel) {
			return null;
		}

		return (
			<>
				{radiantSlots}
				{legacyPanel}
			</>
		);
	}

	override render() {
		this.dataset.placement = this.placement;
		this.dataset.panelOpen = this.panelOpen ? 'true' : undefined;
		const dockEmphasized = this.hovered || this.panelOpen;

		return (
			<>
				<div
					data-ref="panelShell"
					class="eco-dev-toolbar__panel-shell"
					on:mouseenter={() => this.handleShellEnter()}
					on:mouseleave={(event) => this.handlePointerLeave(event)}
				>
					{this.renderActivePanel()}
				</div>
				{this.panelOpen ? (
					<div
						class="eco-dev-toolbar__hit-bridge"
						data-placement={this.placement}
						aria-hidden="true"
						on:mouseenter={() => this.handleShellEnter()}
						on:mouseleave={(event) => this.handlePointerLeave(event)}
					/>
				) : null}
				<div
					data-ref="shell"
					class="eco-dev-toolbar__shell"
					data-placement={this.placement}
					data-open={this.panelOpen ? 'true' : undefined}
					data-stealth={this.stealthPhase === 'hidden' ? 'true' : undefined}
					data-stealth-phase={
						this.stealthPhase === 'dwell' || this.stealthPhase === 'fade' ? this.stealthPhase : undefined
					}
					data-hover={dockEmphasized ? 'true' : undefined}
					on:mouseenter={() => this.handleShellEnter()}
					on:mouseleave={(event) => this.handleShellLeave(event)}
					on:click={() => this.handleShellClick()}
				>
					<div class="eco-dev-toolbar__dock" role="toolbar" aria-label="Ecopages dev toolbar">
						{BUILT_IN_APPS.map((app) => this.renderDockButton(app))}
						{this.extensionApps.map((app) => this.renderDockButton(app))}
					</div>
				</div>
			</>
		);
	}
}

export { DEV_TOOLBAR_ELEMENT_NAME };
