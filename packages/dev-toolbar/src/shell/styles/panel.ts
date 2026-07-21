export const DEV_TOOLBAR_PANEL_STYLES = `
.eco-dev-toolbar__panel-shell {
	position: fixed;
	z-index: 1;
	width: var(--eco-dev-toolbar-panel-width);
	max-height: min(60vh, 28rem);
	overflow: auto;
	border-radius: calc(var(--eco-dev-toolbar-radius) + 0.1rem);
	background: color-mix(in srgb, var(--eco-dev-toolbar-bg-elevated) 94%, transparent);
	backdrop-filter: blur(16px) saturate(140%);
	-webkit-backdrop-filter: blur(16px) saturate(140%);
	border: 1px solid rgba(255, 255, 255, 0.1);
	box-shadow:
		0 0 0 1px rgba(0, 0, 0, 0.3),
		0 18px 48px rgba(0, 0, 0, 0.48),
		0 6px 16px rgba(0, 0, 0, 0.28);
	pointer-events: auto;
	transition:
		opacity 180ms var(--eco-dev-toolbar-ease),
		visibility 180ms var(--eco-dev-toolbar-ease);
}

eco-dev-toolbar:not([data-panel-open='true']) .eco-dev-toolbar__panel-shell {
	visibility: hidden;
	opacity: 0;
	pointer-events: none;
}

.eco-dev-toolbar__panel-slot[hidden] {
	display: none !important;
}

eco-dev-toolbar[data-panel-open='true'] .eco-dev-toolbar__panel-shell {
	visibility: visible;
	opacity: 1;
}

.eco-dev-toolbar__hit-bridge {
	position: fixed;
	z-index: 1;
	pointer-events: auto;
}

eco-dev-toolbar[data-placement='bottom'] .eco-dev-toolbar__hit-bridge {
	left: 50%;
	bottom: calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size));
	width: min(var(--eco-dev-toolbar-panel-width), calc(100vw - 1.5rem));
	height: var(--eco-dev-toolbar-panel-gap);
	transform: translateX(-50%);
}

eco-dev-toolbar[data-placement='top'] .eco-dev-toolbar__hit-bridge {
	left: 50%;
	top: calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size));
	width: min(var(--eco-dev-toolbar-panel-width), calc(100vw - 1.5rem));
	height: var(--eco-dev-toolbar-panel-gap);
	transform: translateX(-50%);
}

eco-dev-toolbar[data-placement='left'] .eco-dev-toolbar__hit-bridge {
	top: 50%;
	left: calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size));
	width: var(--eco-dev-toolbar-panel-gap);
	height: min(28rem, 60vh);
	transform: translateY(-50%);
}

eco-dev-toolbar[data-placement='right'] .eco-dev-toolbar__hit-bridge {
	top: 50%;
	right: calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size));
	width: var(--eco-dev-toolbar-panel-gap);
	height: min(28rem, 60vh);
	transform: translateY(-50%);
}

@media (max-width: 40rem) {
	eco-dev-toolbar[data-placement='left'] .eco-dev-toolbar__hit-bridge,
	eco-dev-toolbar[data-placement='right'] .eco-dev-toolbar__hit-bridge {
		display: none;
	}
}

eco-dev-toolbar[data-placement='bottom'] .eco-dev-toolbar__panel-shell {
	inset: auto auto calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size) + var(--eco-dev-toolbar-panel-gap)) 50%;
	transform: translateX(-50%);
}

eco-dev-toolbar[data-placement='top'] .eco-dev-toolbar__panel-shell {
	inset: calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size) + var(--eco-dev-toolbar-panel-gap)) auto auto 50%;
	transform: translateX(-50%);
}

eco-dev-toolbar[data-placement='left'] .eco-dev-toolbar__panel-shell {
	inset: 50% auto auto calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size) + var(--eco-dev-toolbar-panel-gap));
	width: min(
		var(--eco-dev-toolbar-panel-width),
		calc(100vw - var(--eco-dev-toolbar-edge-gap) - var(--eco-dev-toolbar-dock-size) - var(--eco-dev-toolbar-panel-gap) - 1rem)
	);
	transform: translateY(-50%);
}

eco-dev-toolbar[data-placement='right'] .eco-dev-toolbar__panel-shell {
	inset: 50% calc(var(--eco-dev-toolbar-edge-gap) + var(--eco-dev-toolbar-dock-size) + var(--eco-dev-toolbar-panel-gap)) auto auto;
	width: min(
		var(--eco-dev-toolbar-panel-width),
		calc(100vw - var(--eco-dev-toolbar-edge-gap) - var(--eco-dev-toolbar-dock-size) - var(--eco-dev-toolbar-panel-gap) - 1rem)
	);
	transform: translateY(-50%);
}

@media (max-width: 40rem) {
	eco-dev-toolbar[data-placement='left'] .eco-dev-toolbar__panel-shell,
	eco-dev-toolbar[data-placement='right'] .eco-dev-toolbar__panel-shell {
		inset: 50% auto auto 50%;
		width: min(28rem, calc(100vw - 1.5rem));
		max-height: min(70dvh, 28rem);
		transform: translate(-50%, -50%);
	}
}

`;
