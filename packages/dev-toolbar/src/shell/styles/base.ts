export const DEV_TOOLBAR_BASE_STYLES = `
eco-dev-toolbar {
	--eco-dev-toolbar-bg: #0f1419;
	--eco-dev-toolbar-bg-elevated: #151b22;
	--eco-dev-toolbar-fg: #f3f4f6;
	--eco-dev-toolbar-muted: #9ca3af;
	--eco-dev-toolbar-accent: #8b7cff;
	--eco-dev-toolbar-accent-soft: rgba(139, 124, 255, 0.16);
	--eco-dev-toolbar-warning: #f59e0b;
	--eco-dev-toolbar-error: #ef4444;
	--eco-dev-toolbar-panel-width: min(28rem, calc(100vw - 1.5rem));
	--eco-dev-toolbar-dock-size: 2.75rem;
	--eco-dev-toolbar-edge-gap: 0.75rem;
	--eco-dev-toolbar-panel-gap: 0.55rem;
	--eco-dev-toolbar-stealth-peek: 0.12rem;
	--eco-dev-toolbar-radius: 0.65rem;
	--eco-dev-toolbar-ease: cubic-bezier(0.22, 1, 0.36, 1);
	position: fixed;
	z-index: 2147483646;
	isolation: isolate;
	font: 12px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
	color: var(--eco-dev-toolbar-fg);
	pointer-events: none;
}

eco-dev-toolbar[data-placement='bottom'] {
	left: 0;
	right: 0;
	top: auto;
	bottom: 0.75rem;
	display: flex;
	justify-content: center;
	transform: none;
}

eco-dev-toolbar[data-placement='top'] {
	left: 0;
	right: 0;
	bottom: auto;
	top: 0.75rem;
	display: flex;
	justify-content: center;
	transform: none;
}

eco-dev-toolbar[data-placement='left'] {
	left: 0.75rem;
	right: auto;
	top: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	transform: none;
}

eco-dev-toolbar[data-placement='right'] {
	right: 0.75rem;
	left: auto;
	top: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	transform: none;
}
`;
