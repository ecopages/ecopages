import type { EcoDevManifest } from './dev-manifest.ts';

export type DevToolbarBadge = {
	count?: number;
	severity?: 'info' | 'warning' | 'error';
};

export type DevToolbarPanelContext = {
	document: Document;
	manifest: EcoDevManifest | undefined;
	mountTarget: HTMLElement;
	onBadgeChange: (badge: DevToolbarBadge | undefined) => void;
	onRouteChange: (listener: () => void) => () => void;
};

/**
 * Contract for one toolbar app panel.
 */
export type DevToolbarApp = {
	id: string;
	label: string;
	icon: string;
	mount: (context: DevToolbarPanelContext) => void | (() => void);
};
